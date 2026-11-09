"""Build public officer counts from the local 5 Nov extracts. Usage: python3 scripts/officer_snapshot.py SOURCE_DIR"""
import collections
import difflib
import gzip
import json
import pathlib
import re
import sys
import unicodedata

root = pathlib.Path(sys.argv[1])
scs, phcs, _, assessed = json.loads((root / 'remapped.json').read_text())
by_phc = {row[3]: row for row in phcs}
by_sc = {row[4]: row for row in scs}
def copy_rows(filename, table):
    with gzip.open(root / filename, 'rt') as source:
        for line in source:
            if line.startswith('COPY public.' + table + ' ('):
                fields = line.partition(' (')[2].partition(')')[0].split(', ')
                break
        else:
            raise ValueError(table)
        for line in source:
            if line.rstrip() == r'\.':
                break
            values = [None if x == r'\N' else re.sub(r'\\(.)',lambda m: {'n':'\n','t':'\t','r':'\r'}.get(m[1],m[1]), x) for x in line.rstrip('\n').split('\t')]
            yield dict(zip(fields,values))
def norm(s):
    s = unicodedata.normalize('NFKC',s or '').casefold()
    s = re.sub(r'\b(?:primary health cent(?:re|er)|p\.?h\.?c|iphs|tribal|tr|24\s*[x×*]\s*7)\b',' ',s)
    for pattern,value in [('budruk','bk'),('khurd','kh')]:
        s = re.sub(r'\b'+pattern+r'\b',value,s)
    return ''.join(c for c in s if c.isalnum())
aliases = collections.defaultdict(lambda: collections.defaultdict(set))
def alias(nin,name):
    d,b,*_ = by_phc[nin]
    if norm(name):
        aliases[d,b][norm(name)].add(nin)
for row in phcs:
    alias(row[3],row[2])
labels = collections.defaultdict(set)
latest = {}
for kind, file, table, idfield, master in [('PHC','assessment-data.sql.gz','submissions','nin',by_phc),('SC','sc-data.sql.gz','sc_submissions','facility_id',by_sc)]:
    for row in copy_rows(file,table):
        id = row[idfield]
        if id not in master or row['status'] not in ('SUBMITTED','VERIFIED') or row['reopened_at']:
            continue
        if kind == 'PHC':
            alias(id,row['phc_name'])
        if row['period_fy'] != '2026-27':
            continue
        a = json.loads(row['answers'])
        if kind == 'SC':
            labels[id].update([row['parent_phc_name'],a.get('S_B3.v')])
        key = kind,id
        stamp = row['created_at'],row['id']
        if key not in latest or stamp > latest[key][0]:
            latest[key] = stamp,a

for row in copy_rows('sc-data.sql.gz','sc_facility_requests'):
    if row['status']=='approved':
        labels[row['facility_id']].update([row['requested_parent_phc_name'],row['requested_parent_other']])
reviews=[]
for d,b,name,_,id,recorded,nin,linked,*_ in scs:
    if linked:
        continue
    raw = sorted({s.strip() for s in [recorded,*labels[id]] if isinstance(s,str) and s.strip()})
    index = aliases[d,b]
    matches = [index.get(norm(label),set()) for label in raw]
    ids = set.union(*matches) if matches else set()
    candidate = ''
    if matches and all(len(x)==1 for x in matches) and len(ids)==1 and not nin:
        status = 'Backup match'
        candidate = by_phc[next(iter(ids))][2]
    elif len(ids)>1 or (ids and any(not x for x in matches)) or nin:
        status = 'Conflicting evidence'
    else:
        # Suggestions are triage only. Rank distinct PHCs, not multiple aliases of one PHC.
        scores = collections.Counter()
        for label in raw:
            for spelling, targets in index.items():
                score = difflib.SequenceMatcher(None,norm(label),spelling).ratio()
                for target in targets:
                    scores[target] = max(score,scores[target])
        best = scores.most_common(2)
        if best and best[0][1]>=0.77 and (len(best)==1 or best[0][1]-best[1][1]>=0.12):
            candidate=by_phc[best[0][0]][2]
            status='Check spelling'
        else:
            status='Confirm parent'
    reviews.append([d,b,name,recorded or '',status,candidate])

from indicator_rules import assess, public_remark
site=pathlib.Path(__file__).resolve().parents[1]
private_dir = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv)>2 else None
if private_dir and (private_dir == site or site in private_dir.parents):
    raise ValueError('Private output must be outside the public site')
def original_remark(value):
    return value.strip() if isinstance(value,str) else ''
remark_text=original_remark if private_dir else public_remark
explorer=json.loads((site/'explorer.html').read_text().split('const D = ',1)[1].split(';\n',1)[0])
extra={x['source_id']:json.loads(x['answers']) for x in copy_rows('assessment-data.sql.gz','phc_additional_information') if x['source_type']=='SUBMISSION' and x['status']=='SUBMITTED'}
# Keep the first five public indicator URLs stable.
order=[11,5,36,37,53]+[i for i in range(55) if i not in (11,5,36,37,53,46)]
names={18:'Drainage absent or non-functional',11:'Accessible toilet unavailable or partial',24:'MO vacancy in reported staffing bands',45:'No teleconsultation network',51:'No district officer visit since April',54:'No grievance redressal reported'}
measures=[[explorer['secs'][section],names.get(i,name),explorer['s'][0][i] is not None] for i in order for section,name in [explorer['inds'][i]]]
facilities=[]
texts=[''];lookup={'':0}
def text_id(s):
    if s not in lookup:lookup[s]=len(texts);texts.append(s)
    return lookup[s]
for (kind,id),(stamp,a) in latest.items():
    d,b,name=(by_sc if kind=='SC' else by_phc)[id][:3]
    states=[];details={}
    for j,i in enumerate(order):
        status,evidence,remark=assess(i,kind,a,extra.get(stamp[1],{}),remark_text) if kind=='PHC' or measures[j][2] else ('-','','')
        states.append(status)
        if status=='1' or (status=='?' and remark):details[j]=[text_id(evidence),text_id(remark)]
    facilities.append([d,b or '',name,kind,''.join(states),details])
assert len(reviews)==1992 and len(facilities)==12793 and len(measures)==54 and sum(m[2] for m in measures)==35
districts=[x[0] for x in json.loads((root/'review-counts.json').read_text())]
payload=dict(districts=districts,reviews=reviews,facilities=facilities,measures=measures,texts=texts)
if private_dir:
    import shutil
    private_dir.mkdir(parents=True,exist_ok=True,mode=0o700)
    for filename in ('index.html','responsive.css','officer.js','exports.js','explorer.html','snapshot.js'):
        shutil.copy2(site/filename,private_dir/filename)
    shutil.copytree(site/'vendor',private_dir/'vendor',dirs_exist_ok=True)
    page=private_dir/'index.html'
    archive_name='Maharashtra-District-Reports-2026-11-05.zip'
    private_zip=private_dir.parent/'Maharashtra-All-District-Gap-Reports-2026-11-05.zip'
    archive_source=private_zip if private_zip.is_file() else site/'reports'/archive_name
    (private_dir/'reports').mkdir(exist_ok=True)
    shutil.copy2(archive_source,private_dir/'reports'/archive_name)
    page.write_text(page.read_text().replace('Officer overview · Backup','Local officer copy with original remarks · Backup'))
((private_dir or site)/'officer-data.js').write_text('const officerData = '+json.dumps(payload,separators=(',',':'),ensure_ascii=False)+';\n')
