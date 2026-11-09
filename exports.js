// Libraries are loaded on demand so ordinary district drill-down stays lightweight.
const libraries=new Map();
function loadLibrary(path) {
  if(!libraries.has(path)) libraries.set(path,new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='vendor/'+path;
    script.onload=resolve;
    script.onerror=()=>{libraries.delete(path);script.remove();reject(new Error('Could not load the export library.'));};
    document.head.append(script);
  }));
  return libraries.get(path);
}
function collectReport(selection) {
  const {district,category,kind,scope,ranked}=selection;
  const ordered=[...ranked].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
  const groups=ordered.map(m=>{
    const rows=scope.filter(r=>r[4][m.i]==='1').sort((a,b)=>a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[3].localeCompare(b[3]));
    const phc=rows.filter(r=>r[3]==='PHC').length;
    return {...m,rows,phc,scCount:rows.length-phc};
  });
  const unique=scope.filter(r=>ordered.some(m=>r[4][m.i]==='1')).length;
  const count=groups.reduce((sum,g)=>sum+g.count,0);
  const lead=groups[0];
  const abstract=unique?fmt(unique)+' of '+fmt(scope.length)+' assessed facilities reported at least one gap. The largest gap was “'+lead.name+'”, reported by '+fmt(lead.count)+' of '+fmt(lead.total)+' eligible facilities ('+percent(lead.count,lead.total)+').':
    scope.length?'No facility reported a gap in this selection.':'There were no assessed facilities in this selection.';
  return {district,category,kind,groups,abstract,count,unique,assessed:scope.length,scopeLabel:[district,category,kind].join(' · ')};
}
function urgentNote(report) {
  const stocks=report.groups.filter(urgency);
  return stocks.length?'Urgent stock follow-up · '+stocks.map(g=>urgency(g)+' at '+g.count+' PHC'+(g.count===1?'':'s')).join(', '):'';
}
const summaryCols=['Indicator','PHCs','SCs','Affected','Eligible','Affected %','Missing'];
function summaryValues(g) {
  return [g.name,g.phc,g.scCount,g.count,g.total,g.total?g.count/g.total:null,g.missing];
}
function downloadBlob(blob,filename) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function sheetHeader(row) {
  row.eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF15574B'}};
    cell.alignment={vertical:'middle',wrapText:true};
  });
  row.height=28;
}
async function makeExcel(r) {
  await loadLibrary('exceljs.min.js');
  const book=new ExcelJS.Workbook();
  const summary=book.addWorksheet('Abstract',{views:[{state:'frozen',ySplit:6}]});
  [48,12,12,14,14,17,14,23,18].forEach((w,i)=>summary.getColumn(i+1).width=w);
  for(const [i,text] of ['District gap abstract',r.scopeLabel,'Assessment backup · 5 November 2026 · FY 2026–27',[r.abstract,urgentNote(r)].filter(Boolean).join('\n'),bandLegend+' · Missing includes unclear answers.'].entries()){
    summary.mergeCells(i+1,1,i+1,9);
    const c=summary.getCell(i+1,1);c.value=text;c.alignment={wrapText:true,vertical:'middle'};
    summary.getRow(i+1).height=i===3?58:23;
  }
  summary.getCell('A1').font={size:16,bold:true,color:{argb:'FF15574B'}};
  sheetHeader(summary.addRow([...summaryCols,'Prevalence','Urgent follow-up']));
  for(const group of r.groups){
    const row=summary.addRow([...summaryValues(group),prevalence(group).label,urgency(group)?'Urgent · '+urgency(group):'']);
    const fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+prevalence(group).color.slice(1)}};
    row.getCell(6).fill=fill;row.getCell(8).fill=fill;
    if(group.total===group.missing) row.getCell(6).value=null;
    if(urgency(group)) row.getCell(9).font={bold:true,color:{argb:'FF862137'}};row.getCell(6).numFmt='0.0%';row.getCell(1).alignment={wrapText:true};row.height=30;
  }
  const details=book.addWorksheet('Facility details',{views:[{state:'frozen',ySplit:1}]});
  [24,34,47,24,22,29,11,30,68].forEach((w,i)=>details.getColumn(i+1).width=w);
  sheetHeader(details.addRow(['Category','District','Indicator','Block','Facility type','Facility name','Gap rank','Assessment response','Facility remark']));
  for(const [i,g] of r.groups.entries()) for(const facility of g.rows){
    const [district,block,name,type,response,remark]=evidenceCells(facility,g.i);
    const row=details.addRow([g.category,district,g.name,block,type,name,i+1,response,remark]);
    row.alignment={wrapText:true,vertical:'top'};
    row.height=Math.min(409,Math.max(30,16*(remark.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/58)),0))));
  }
  details.autoFilter={from:'A1',to:'I'+details.rowCount};
  return new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function pdfTable(headers,rows,widths,caption) {
  const heading=caption?[[{text:caption,colSpan:headers.length,bold:true,color:'#15574B'},...headers.slice(1).map(()=>'')]]:[];
  return {layout:'lightHorizontalLines',fontSize:8,table:{widths,headerRows:1+heading.length,body:[...heading,
    headers.map(text=>({text,bold:true,color:'white',fillColor:'#15574B',margin:[0,2]})),...rows]}};
}
async function makePdf(r) {
  await Promise.all([loadLibrary('pdfmake.min.js'),loadLibrary('report-fonts.js')]);
  const title=text=>({text,bold:true,fontSize:15,color:'#15574B',margin:[0,9,0,4]});
  const content=[{text:'District gap abstract',bold:true,fontSize:22,color:'#15574B'},title(r.district),{text:r.category+' · '+r.kind,margin:[0,0,0,9]},r.abstract,{text:bandLegend,fontSize:9,margin:[0,5,0,3]}];
  if(urgentNote(r))content.push({text:urgentNote(r),bold:true,color:'#862137',margin:[0,3,0,3]});
  const priority=r.groups.filter(g=>g.count).slice(0,8);
  if(priority.length){
    content.push(title('Biggest reported gaps'),pdfTable(summaryCols,priority.map(g=>[g.name,g.phc,g.scCount,g.count,g.total,{text:bandText(g),fillColor:prevalence(g).color},g.missing]),['*',25,25,35,32,80,34]));
    const blocks=new Map();
    for(const row of priority[0].rows) blocks.set(row[1]||'Block unrecorded',(blocks.get(row[1]||'Block unrecorded')||0)+1);
    content.push(title('Blocks to follow up first'),{text:priority[0].name+' · '+[...blocks].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,3).map(([b,n])=>b+' ('+n+')').join(', ')});
    const examples=[];
    for(const group of priority.slice(0,3)){
      const row=group.rows.find(facility=>{
        const remark=evidenceCells(facility,group.i)[5];
        return !['No recorded remark','Remark available in the assessment record'].includes(remark) && remark.length<=150;
      });
      if(row){
        const [,block,name,type,,remark]=evidenceCells(row,group.i);
        examples.push([group.name,name+' ('+type+')',block,remark]);
      }
    }
    if(examples.length)content.push(title('Examples from facility assessments'),pdfTable(['Gap','Facility','Block','Recorded remark'],examples,['*',94,70,'*']));
  }
  content.push({text:fmt(r.groups.length)+' indicators reviewed · '+fmt(r.count)+' facility–indicator records. Each affected facility appears once per reported gap. Missing includes unclear answers.',fontSize:9,margin:[0,9,0,0]});
  let first=true;
  for(const g of r.groups){
    if(!g.count)continue;
    content.push({...title(g.name),...(first?{pageBreak:'before'}:{})},{text:(urgency(g)?'URGENT · ':'')+bandText(g)+' · '+g.category+' · '+g.count+' affected / '+g.total+' eligible · '+g.missing+' missing',fontSize:9,margin:[0,0,0,4]});
    first=false;
    content.push(pdfTable(['Block','Facility','Type','Response','Facility remark'],g.rows.map(row=>evidenceCells(row,g.i).slice(1)),[67,92,25,87,'*'],(urgency(g)?'URGENT · ':'')+g.name));
  }
  if(!r.count)content.push(title('Facility details'),{text:'No reported gaps to list.'});
  const zero=r.groups.filter(g=>!g.count);
  if(zero.length) content.push(title('Indicators without reported gaps'),pdfTable(['Indicator','Eligible','Prevalence','Missing'],zero.map(g=>[g.name,g.total,{text:bandText(g),fillColor:prevalence(g).color},g.missing]),['*',45,100,45]));
  const doc={info:{title:r.scopeLabel+' · Gap report'},pageSize:'A4',pageMargins:[32,37,32,34],
    defaultStyle:{font:'Report',fontSize:10,color:'#18342F'},content,
    header:()=>({text:'FY 2026–27  /  '+r.district+'  /  Assessment backup of 5 November 2026',fontSize:8,margin:[32,14],color:'#47655C'}),
    footer:(page,total)=>({text:r.district+'  ·  '+page+' / '+total,alignment:'right',fontSize:8,margin:[32,9]})};
  return await new Promise((resolve,reject)=>{
    try{pdfMake.createPdf(doc,null,{Report:{normal:'regular.ttf',bold:'bold.ttf',italics:'regular.ttf',bolditalics:'bold.ttf'}},reportFonts).getBlob(resolve);}
    catch(err){reject(err);}
  });
}
async function exportDistrict(format) {
  if(!exportScope || !$('district').selectedIndex || $('downloads').getAttribute('aria-busy')==='true')return;
  const section=$('downloads'),status=$('exportStatus');
  section.setAttribute('aria-busy','true');
  for(const b of section.querySelectorAll('button'))b.disabled=true;
  try{
    const report=collectReport(exportScope);
    status.textContent='Preparing '+format+' for '+report.district+'…';
    const blob=format==='PDF'?await makePdf(report):await makeExcel(report);
    const filename=[report.district,report.category,report.kind,'gap-report-2026-11-05'].join('-').replace(/[^\p{L}\p{N}-]+/gu,'-');
    downloadBlob(blob,filename+(format==='PDF'?'.pdf':'.xlsx'));
    status.textContent=format+' ready for '+report.district+' · '+fmt(report.count)+' facility–indicator records.';
  }catch(error){status.textContent='Download failed. '+error.message;}
  finally{section.setAttribute('aria-busy','false');for(const b of section.querySelectorAll('button'))b.disabled=!$('district').selectedIndex;}
}
$('downloadPdf').onclick=()=>exportDistrict('PDF');
$('downloadExcel').onclick=()=>exportDistrict('Excel');
