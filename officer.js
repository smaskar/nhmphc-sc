const { districts, facilities, reviews, measures } = officerData;
const $ = id => document.getElementById(id);
const fmt = value => value.toLocaleString('en-IN');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option = value => '<option>'+esc(value)+'</option>';
const params = new URLSearchParams(location.search);
const mapping = params.get('view') === 'mapping';
const abstractView = params.get('view') === 'abstract';
const viewName = abstractView ? 'abstract' : mapping ? 'mapping' : 'gaps';
const allDistricts = 'Maharashtra';
let selected = Number(params.get('indicator') ?? -1);
if (!Number.isInteger(selected) || !measures[selected]) selected = -1;
let page = 0, detailRows = [], exportScope;
$('district').innerHTML = [allDistricts,...districts].map(option).join('');
$('category').insertAdjacentHTML('beforeend',[...new Set(measures.map(m=>m[0]))].map(option).join(''));
function restore(id) {
  if ([...$(id).options].some(o=>o.value===params.get(id))) $(id).value=params.get(id);
}
for (const id of ['district','kind','category','sort','status','response']) restore(id);
$('search').value=params.get('search') || '';
$(abstractView?'abstractNav':mapping?'mappingNav':'reviewNav').setAttribute('aria-current','page');
for (const id of ['kindLabel','categoryLabel','sortControl']) $(id).hidden=mapping;
$('statusLabel').hidden=!mapping;
$('responseLabel').hidden=mapping;
function save() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('view',viewName);
  for (const id of ['district',...(mapping?['status']:['kind','category','sort','response']),'block']) {
    if ($(id).selectedIndex>0) url.searchParams.set(id,$(id).value);
  }
  if (viewName==='gaps') url.searchParams.set('indicator',selected);
  if ($('search').value) url.searchParams.set('search',$('search').value);
  history.replaceState(null,'',url);
  for (const [id,view] of [['abstractNav','abstract'],['reviewNav','gaps'],['mappingNav','mapping']]) {
    const dest=new URL(location.pathname,location.href);
    dest.searchParams.set('view',view);
    if ($('district').selectedIndex>0) dest.searchParams.set('district',$('district').value);
    if(!mapping && view!=='mapping') for(const filter of ['kind','category']) {
      if($(filter).selectedIndex>0) dest.searchParams.set(filter,$(filter).value);
    }
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
const bandLegend='Widespread ≥50% · High 25–<50% · Moderate 10–<25% · Low <10%';
const urgentStocks=new Map([
  ['Anti Snake Venom out of stock','ASV'],
  ['Anti Rabies Vaccine out of stock','ARV'],
  ['Anti Rabies Serum out of stock','ARS']
]);
function urgency(m) {
  return m.count>0 ? urgentStocks.get(m.name) : undefined;
}
function prevalence(m) {
  if(!m.total) return {label:'No assessment',color:'#E2E5E4'};
  if(m.missing===m.total) return {label:'No usable responses',color:'#E2E5E4'};
  const rate=m.count/m.total;
  if(rate>=0.5) return {label:'Widespread',color:'#F7C4C4'};
  if(rate>=0.25) return {label:'High',color:'#FFD6AD'};
  if(rate>=0.1) return {label:'Moderate',color:'#F8E392'};
  return {label:'Low',color:'#CBE8D3'};
}
function bandText(m) {
  const band=prevalence(m);
  return m.total && m.total!==m.missing ? band.label+' · '+percent(m.count,m.total) : band.label;
}
function bandCell(m) {
  return '<td><span class="rate-band" style="background:'+prevalence(m).color+'">'+bandText(m)+'</span></td>';
}
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
  const scope=facilities.filter(r=>selectedDistrict(r) && (!$('kind').selectedIndex || r[3]===$('kind').value));
  const available=measures.map(([category,name,sc],i)=>({category,name,sc,i})).filter(m=>$('kind').value!=='SC' || m.sc);
  const categories=[...new Set(available.map(m=>m.category))];
  const oldCategory=$('category').value;
  $('category').innerHTML=['All categories',...categories].map(option).join('');
  if(categories.includes(oldCategory)) $('category').value=oldCategory;
  const ranked=available.filter(m=>!$('category').selectedIndex || m.category===$('category').value);
  for(const m of ranked) {
    m.count=0;m.missing=0;m.total=0;
    for(const r of scope) {
      const state=r[4][m.i];
      if(state!=='-') m.total++;
      if(state==='1') m.count++;
      if(state==='?') m.missing++;
    }
  }
  const score=m=>$('sort').value==='rate'?(m.total?m.count/m.total:-1):m.count;
  const rank=(a,b)=>score(b)-score(a) || b.count-a.count || a.name.localeCompare(b.name);
  ranked.sort(rank);
  exportScope={district:$('district').value,category:$('category').value,kind:$('kind').value,scope,ranked};
  $('downloads').hidden=mapping || abstractView;
  $('abstractDownload').hidden=!abstractView;
  $('reportHint').textContent=$('district').selectedIndex?'Includes every reported gap for this district, category and facility type.':'Choose a district to download its report.';
  for (const button of $('downloads').querySelectorAll('button')) button.disabled=!$('district').selectedIndex || $('downloads').getAttribute('aria-busy')==='true';
  cards([[scope.length,'Assessed facilities'],[scope.filter(r=>ranked.some(m=>r[4][m.i]==='1')).length,'Facilities with at least one selected gap'],[scope.filter(r=>ranked.some(m=>r[4][m.i]==='?')).length,'Facilities missing at least one selected response']]);
  if(abstractView) {
    $('detail').hidden=true;
    $('sortControl').hidden=true;
    $('rankTitle').textContent=$('district').value+' assessment abstract';
    const gaps=[...ranked].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
    const biggest=gaps.filter(m=>m.count).slice(0,8);
    $('definition').textContent=biggest.length?'Biggest reported gaps by number of affected facilities. Bar length shows affected facilities. Select an indicator to see facility names and remarks.':scope.length?'No gaps were reported for this selection.':'No eligible assessments in this selection.';
    function facilityLink(m,label) {
      const link=new URL(location.href);
      link.search='';
      link.searchParams.set('view','gaps');
      link.searchParams.set('indicator',m.i);
      for(const id of ['district','kind','category']) if($(id).selectedIndex>0) link.searchParams.set(id,$(id).value);
      link.hash='detail';
      return '<a href="'+esc(link.href)+'">'+esc(label)+'</a>';
    }
    const urgent=gaps.filter(urgency);
    const alerts=urgent.length?'<aside class="urgent-box"><strong>Urgent stock follow-up</strong><ul>'+urgent.map(m=>'<li>'+facilityLink(m,urgency(m)+' stock-out · '+fmt(m.count)+' PHCs')+'</li>').join('')+'</ul></aside>':'';
    $('ranking').innerHTML=alerts+'<ol class="abstract-gaps">'+biggest.map(m=>'<li>'+facilityLink(m,m.name)+'<div class="abstract-bar" aria-hidden="true"><i style="width:'+100*m.count/biggest[0].count+'%"></i></div><div><span class="rate-band" style="background:'+prevalence(m).color+'">'+bandText(m)+'</span> '+fmt(m.count)+' of '+fmt(m.total)+' eligible · '+fmt(m.missing)+' missing</div></li>').join('')+'</ol>';
    return;
  }
  $('rankTitle').textContent='Gap priorities';
  $('definition').textContent='Compare affected counts for workload and percentages for prevalence. Each rate uses eligible assessed facilities. Select a category, measure or district to inspect its facility records.';
  if(!ranked.some(m=>m.i===selected)) selected=ranked[0].i;
  const groups=categories.map(category=>{
    const members=available.filter(m=>m.category===category);
    const missing=scope.filter(r=>members.some(m=>r[4][m.i]==='?')).length;
    const allUnknown=scope.filter(r=>members.some(m=>r[4][m.i]==='?') && members.every(m=>['?','-'].includes(r[4][m.i]))).length;
    return {name:category,missing:allUnknown,anyMissing:missing,count:scope.filter(r=>members.some(m=>r[4][m.i]==='1')).length,total:scope.filter(r=>members.some(m=>r[4][m.i]!=='-')).length};
  }).sort(rank);
  let html=!$('category').selectedIndex?'<h3>Facilities affected by category</h3>'+table(['Category','Affected facilities','Eligible','Prevalence','Facilities missing a response'],groups.map(m=>'<tr><td><button class="pick" data-category="'+esc(m.name)+'">'+esc(m.name)+'</button></td>'+num(m.count)+num(m.total)+bandCell(m)+num(m.anyMissing)+'</tr>')):'';
  const m=ranked.find(m=>m.i===selected);
  const byDistrict=new Map();
  for(const r of scope) {
    if(r[4][selected]==='-') continue;
    if(!byDistrict.has(r[0])) byDistrict.set(r[0],{name:r[0],count:0,total:0,missing:0});
    const d=byDistrict.get(r[0]);d.total++;if(r[4][selected]==='?') d.missing++;if(r[4][selected]==='1') d.count++;
  }
  const districtRows=[...byDistrict.values()].sort(rank);
  const urgent=ranked.filter(urgency);
  const alerts=urgent.map(g=>'<button class="urgent-pick" data-measure="'+g.i+'">'+urgency(g)+' stock-out · '+fmt(g.count)+' PHCs</button>').join(' ');
  html='<p class="muted">'+bandLegend+'</p>'+(alerts?'<aside class="urgent-box"><strong>Urgent stock follow-up</strong><div>'+alerts+'</div></aside>':'')+html;
  html+='<h3>Indicators</h3>'+table(['Indicator','Applies to','Affected','Eligible','% affected','Missing'],ranked.map(m=>
    '<tr class="'+(m.i===selected?'selected':'')+'"><td><button class="pick" data-measure="'+m.i+'">'+esc(m.name)+'</button>'+(urgency(m)?'<strong class="urgent-tag">Urgent</strong>':'')+'</td>'+cell(m.sc?'PHC, SC':'PHC')+num(m.count)+num(m.total)+bandCell(m)+num(m.missing)+'</tr>'));
  if (!$('district').selectedIndex) html+='<details open id="districtRanks"><summary>District comparison · '+esc(m.name)+'</summary>'+table(['District','Affected','Eligible','Prevalence','Missing'],districtRows.map(d=>'<tr><td><button class="pick" data-district="'+esc(d.name)+'">'+esc(d.name)+'</button></td>'+num(d.count)+num(d.total)+bandCell(d)+num(d.missing)+'</tr>'))+'</details>';
  $('ranking').innerHTML=html;
  for(const grid of $('ranking').querySelectorAll('table')) {
    grid.classList.add('gap-grid');
    const headers=Array.from(grid.tHead.rows[0].cells,header=>header.textContent);
    for(const row of grid.tBodies[0].rows) {
      Array.from(row.cells).forEach((cell,i)=>{cell.dataset.label=headers[i];});
    }
  }
  detailRows=scope.filter(r=>r[4][selected]===$('response').value);
  $('detailTitle').textContent=m.name;
  $('detailNote').textContent=(urgency(m)?'Urgent stock follow-up · ':'')+bandText(m)+' · '+$('district').value+' · '+fmt(m.count)+' affected of '+fmt(m.total)+' eligible assessed facilities · '+fmt(m.missing)+' missing or unclear.';
}
function evidenceCells(row, index=selected) {
  const [value,remark]=row[5][index] || [0,0];
  return [...row.slice(0,4),officerData.texts[value] || (row[4][index]==='?'?'Missing or unclear':'Reported gap'),officerData.texts[remark] || 'No recorded remark'];
}
function renderList() {
  const term=$('search').value.toLocaleLowerCase().trim();
  const rows=detailRows.filter(r=>($('block').selectedIndex===0 || r[1]===$('block').value) && (!mapping || $('status').selectedIndex===0 || r[4]===$('status').value) && (!term || (mapping?[r[2],r[3],r[5]]:[r[2]]).some(v=>String(v).toLocaleLowerCase().includes(term))));
  const pages=Math.max(1,Math.ceil(rows.length/25));
  page=Math.min(page,pages-1);
  $('listCount').textContent=fmt(rows.length)+' matching '+(mapping?'subcentres':'facilities');
  const columns=mapping?['District','Block','Subcentre','Recorded parent','Status','Matched or candidate PHC']:['District','Block','Facility','Type','Assessment response','Facility remark'];
  $('list').innerHTML=rows.length?table(columns,rows.slice(25*page,25*(page+1)).map(r=>'<tr>'+(mapping?r:evidenceCells(r)).map((v,i)=>'<td data-label="'+esc(columns[i])+'">'+esc(v||'—')+'</td>').join('')+'</tr>')):'<p>No facilities match these filters.</p>';
  $('prev').disabled=!page; $('next').disabled=page>=pages-1; $('page').textContent=(page+1)+' / '+pages;
}
function render() {
  const block=$('block').value || params.get('block');
  if(mapping) mappingView(); else gapsView();
  if(abstractView) { save(); return; }
  detailRows.sort((a,b)=>a[0].localeCompare(b[0]) || (a[1]||'').localeCompare(b[1]||'') || a[2].localeCompare(b[2]));
  const blocks=[...new Set(detailRows.map(r=>r[1]).filter(Boolean))].sort();
  $('block').innerHTML=['All blocks',...blocks].map(option).join('');
  if (blocks.includes(block)) $('block').value=block;
  renderList();save();
}
$('ranking').onclick=e=>{
  const b=e.target.closest('button'); if (!b) return;
  if (b.classList.contains('urgent-pick')) $('response').value='1';
  if (b.dataset.district) $('district').value=b.dataset.district;
  else if (b.dataset.category) { $('category').value=b.dataset.category; selected=-1; }
  else selected=Number(b.dataset.measure);
  $('block').selectedIndex=0; $('search').value='';page=0;render();
  if(b.dataset.category) $('rankTitle').scrollIntoView();
  else if(b.dataset.measure && !$('district').selectedIndex) $('districtRanks').scrollIntoView();
  else $('detail').scrollIntoView();
};
for (const id of ['district','category','kind','sort','response']) $(id).onchange=()=>{page=0;$('block').selectedIndex=0;render();};
for (const id of ['status','block','search']) $(id).addEventListener(id==='search'?'input':'change',()=>{page=0;renderList();save();});
$('prev').onclick=()=>{page--;renderList();};$('next').onclick=()=>{page++;renderList();};
render();
