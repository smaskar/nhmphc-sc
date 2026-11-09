const { districts, facilities, reviews, measures } = officerData;
const $ = id => document.getElementById(id);
const fmt = value => value.toLocaleString('en-IN');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option = value => '<option>'+esc(value)+'</option>';
const params = new URLSearchParams(location.search);
const mapping = params.get('view') === 'mapping';
const allDistricts = 'Maharashtra';
let selected = Number(params.get('indicator') || 0);
if (!Number.isInteger(selected) || !measures[selected]) selected = 0;
let page = 0, detailRows = [];
$('district').innerHTML = [allDistricts,...districts].map(option).join('');
$('category').insertAdjacentHTML('beforeend',[...new Set(measures.map(m=>m[0]))].map(option).join(''));
function restore(id) {
  if ([...$(id).options].some(o=>o.value===params.get(id))) $(id).value=params.get(id);
}
for (const id of ['district','kind','category','sort','status']) restore(id);
$('search').value=params.get('search') || '';
$(mapping?'mappingNav':'reviewNav').setAttribute('aria-current','page');
for (const id of ['kindLabel','categoryLabel','sortControl']) $(id).hidden=mapping;
$('statusLabel').hidden=!mapping;
function save() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('view',mapping?'mapping':'gaps');
  for (const id of ['district',...(mapping?['status']:['kind','category','sort']),'block']) {
    if ($(id).selectedIndex>0) url.searchParams.set(id,$(id).value);
  }
  if (!mapping) url.searchParams.set('indicator',selected);
  if ($('search').value) url.searchParams.set('search',$('search').value);
  history.replaceState(null,'',url);
  for (const [id,view] of [['reviewNav','gaps'],['mappingNav','mapping']]) {
    const dest=new URL(location.pathname,location.href);
    dest.searchParams.set('view',view);
    if ($('district').selectedIndex>0) dest.searchParams.set('district',$('district').value);
    $(id).href=dest;
  }
}
function cards(items) {
  $('summary').innerHTML=items.map(([value,label])=>'<article><b>'+fmt(value)+'</b><small>'+esc(label)+'</small></article>').join('');
}
function table(headers, rows) {
  return '<table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>';
}
const cell = value => '<td>'+esc(value)+'</td>';
const num = value => '<td class="num">'+fmt(value)+'</td>';
const percent = (value,total) => total?(100*value/total).toFixed(1)+'%':'—';
const selectedDistrict = row => $('district').value===allDistricts || row[0]===$('district').value;
function mappingView() {
  const scope=reviews.filter(selectedDistrict);
  const match=scope.filter(r=>r[4]==='Backup match').length;
  cards([[scope.length,'Originally pending'],[match,'Backup-supported matches'],[scope.length-match,'Still need district review']]);
  $('rankTitle').textContent='Mapping workload by district';
  $('definition').textContent='Ordered by cases still needing district review. Select a district to inspect its recorded parents and matching evidence.';
  const queue=new Map(districts.map(d=>[d,[0,0]]));
  for (const [district,,,,status] of reviews) {
    const counts=queue.get(district);
    counts[0]++;
    if (status==='Backup match') counts[1]++;
  }
  const ordered=[...queue].filter(([d])=>selectedDistrict([d])).sort((a,b)=>(b[1][0]-b[1][1])-(a[1][0]-a[1][1]) || a[0].localeCompare(b[0]));
  $('ranking').innerHTML=table(['District','Original queue','Backup match','Still need review'],ordered.map(([d,[total,matched]])=>
    '<tr><td><button class="pick" data-district="'+esc(d)+'">'+esc(d)+'</button></td>'+num(total)+num(matched)+num(total-matched)+'</tr>'));
  $('detailTitle').textContent='Subcentre mapping register';
  $('detailNote').textContent='Backup match identifies a unique PHC. Check spelling means a possible PHC needs verification. Confirm parent means the district must supply the link.';
  detailRows=scope;
}
function gapsView() {
  const scope=facilities.filter(r=>selectedDistrict(r) && ($('kind').selectedIndex===0 || r[3]===$('kind').value));
  $('sortControl').hidden=$('district').selectedIndex!==0;
  const ranked=measures.map(([category,name],i)=>({
    category,name,i,count:scope.filter(r=>r[4] & (1<<i)).length,missing:scope.filter(r=>r[5] & (1<<i)).length
  })).filter(m=>$('category').selectedIndex===0 || m.category===$('category').value);
  ranked.sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
  const mask=ranked.reduce((v,m)=>v|(1<<m.i),0);
  cards([[scope.length,'Assessed facilities'],[scope.filter(r=>r[4]&mask).length,'Facilities with at least one selected gap'],[scope.filter(r=>r[5]&mask).length,'Facilities missing at least one selected response']]);
  $('rankTitle').textContent='Most reported gaps';
  $('definition').textContent='Five comparable measures have facility-level evidence here. The full assessment explorer covers 54 PHC and 35 subcentre gap indicators. Select a measure to see the districts and facilities affected.';
  if (!ranked.some(m=>m.i===selected)) selected=ranked[0].i;
  $('ranking').innerHTML=table(['Measure','Category','Affected','% assessed','Missing'],ranked.map(m=>
    '<tr class="'+(m.i===selected?'selected':'')+'"><td><button class="pick" data-measure="'+m.i+'">'+esc(m.name)+'</button></td>'+cell(m.category)+num(m.count)+cell(percent(m.count,scope.length))+num(m.missing)+'</tr>'));
  const selectedMask=1<<selected;
  detailRows=scope.filter(r=>r[4]&selectedMask);
  $('detailTitle').textContent=measures[selected][1];
  $('detailNote').textContent=$('district').value+' · '+fmt(detailRows.length)+' affected of '+fmt(scope.length)+' assessed. The register lists facilities reporting this gap.';
  if ($('district').selectedIndex===0) {
    const counts=new Map();
    for (const r of scope) {
      if (!counts.has(r[0])) counts.set(r[0],[0,0]);
      const c=counts.get(r[0]); c[0]++; if (r[4]&selectedMask) c[1]++;
    }
    const score=([,[n,c]])=>$('sort').value==='rate'?c/n:c;
    const order=[...counts].sort((a,b)=>score(b)-score(a) || b[1][1]-a[1][1] || a[0].localeCompare(b[0]));
    $('ranking').insertAdjacentHTML('beforeend','<h3>Districts with the most gaps · '+esc(measures[selected][1])+'</h3>'+table(['District','Affected','Assessed','% affected'],order.slice(0,5).map(([d,[n,c]])=>'<tr><td><button class="pick" data-district="'+esc(d)+'">'+esc(d)+'</button></td>'+num(c)+num(n)+cell(percent(c,n))+'</tr>')));
  }
}
function renderList() {
  const term=$('search').value.toLocaleLowerCase().trim();
  const rows=detailRows.filter(r=>($('block').selectedIndex===0 || r[1]===$('block').value) && (!mapping || $('status').selectedIndex===0 || r[4]===$('status').value) && (!term || (mapping?[r[2],r[3],r[5]]:[r[2]]).some(v=>String(v).toLocaleLowerCase().includes(term))));
  const pages=Math.max(1,Math.ceil(rows.length/25));
  page=Math.min(page,pages-1);
  $('listCount').textContent=fmt(rows.length)+' matching '+(mapping?'subcentres':'facilities');
  $('list').innerHTML=rows.length?table(mapping?['District','Block','Subcentre','Recorded parent','Status','Matched or candidate PHC']:['District','Block','Facility','Type'],rows.slice(25*page,25*(page+1)).map(r=>'<tr>'+(mapping?r:r.slice(0,4)).map(v=>cell(v||'—')).join('')+'</tr>')):'<p>No facilities match these filters.</p>';
  $('prev').disabled=!page; $('next').disabled=page>=pages-1; $('page').textContent=(page+1)+' / '+pages;
}
function render() {
  const block=$('block').value || params.get('block');
  if(mapping) mappingView(); else gapsView();
  detailRows.sort((a,b)=>a[0].localeCompare(b[0]) || (a[1]||'').localeCompare(b[1]||'') || a[2].localeCompare(b[2]));
  const blocks=[...new Set(detailRows.map(r=>r[1]).filter(Boolean))].sort();
  $('block').innerHTML=['All blocks',...blocks].map(option).join('');
  if (blocks.includes(block)) $('block').value=block;
  renderList();save();
}
$('ranking').onclick=e=>{
  const b=e.target.closest('button'); if (!b) return;
  if (b.dataset.district) $('district').value=b.dataset.district;
  else selected=Number(b.dataset.measure);
  $('block').selectedIndex=0; $('search').value='';page=0;render();
  $('detail').scrollIntoView();
};
for (const id of ['district','category','kind','sort']) $(id).onchange=()=>{page=0;$('block').selectedIndex=0;render();};
for (const id of ['status','block','search']) $(id).addEventListener(id==='search'?'input':'change',()=>{page=0;renderList();save();});
$('prev').onclick=()=>{page--;renderList();};$('next').onclick=()=>{page++;renderList();};
render();
