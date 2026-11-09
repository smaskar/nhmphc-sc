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
# A mask stores explicit facility gaps and another stores missing or unrecognised responses.
measures = [
 ('Infrastructure','Accessible toilet unavailable or partial','D1_toilet_accessible','D1_toilet_disability_friendly',{'No','Partially','Partial'}),
 ('Infrastructure','Boundary wall absent or partial','D1_1_2','D1_1_2',{'No','Partially','Partial'}),
 ('Diagnostics','Glucometer unavailable','D5_equipment_glucometer','D5_equipment_glucometer',{'No'}),
 ('Diagnostics','Haemoglobinometer unavailable','D5_equipment_haemoglobinometer','D5_equipment_haemoglobinometer',{'No'}),
 ('Community monitoring','Suggestion box unavailable','D11_suggestion_box','D11_suggestion_box',{'No'})]
facilities=[]
for (kind,id),(_,a) in latest.items():
    d,b,name = (by_sc if kind=='SC' else by_phc)[id][:3]
    gaps = missing = 0
    for i,(_,_,pk,sk,bad) in enumerate(measures):
        v = (a.get('S_'+sk+'_yn.v') or a.get('S_'+sk+'.v')) if kind=='SC' else a.get(pk+'.v')
        if v in bad:
            gaps |= 1<<i
        elif v not in ('Yes','No','Partially','Partial'):
            missing |= 1<<i
    facilities.append([d,b or '',name,kind,gaps,missing])
assert len(reviews)==1992 and len(facilities)==1972+10821
assert all(sum(f[0]==d and f[3]=='SC' for f in facilities)==n for d,n in assessed.items() if d!='Maharashtra')
districts = [x[0] for x in json.loads((root/'review-counts.json').read_text())]
payload=dict(districts=districts,reviews=reviews,facilities=facilities,measures=[m[:2] for m in measures])
path=pathlib.Path(__file__).resolve().parents[1]/'officer-data.js'
path.write_text('const officerData = '+json.dumps(payload,separators=(',',':'),ensure_ascii=False)+';\n')
for d in districts:
    rows=[x for x in reviews if x[0]==d]
    print(d,len(rows),sum(x[4]=='Backup match' for x in rows))
print(collections.Counter(x[4] for x in reviews))
