"""Facility-level rules for the November 2026 officer review."""
import re

# Order follows the assessment explorer. Index 46 is descriptive service volume.
FIELDS = """D1_1_1 D1_disputed_land A_building_year A_building_condition D1_building_reconstruction D1_1_2 D1_1_3 D1_electricity D1_1_6 D1_toilet_male D1_toilet_female D1_toilet_accessible D1_toilet_repair D1_toilet_cleanliness D1_1_7 D1_1_11 D1_solar_status D1_fire_extinguishers D1_drainage_functional D1_drainage_repair D1_doors_windows_repair D1_1_18 D1_1_16 STAFF_mbbs_count STAFF_mbbs_count STAFF_male_1 STAFF_female_1 STAFF_sweeper_1 D4_1 D4_out_of_stock D4_out_of_stock D4_out_of_stock D4_out_of_stock D4_5 D5_equipment_cell_counter D5_equipment_biochemistry D5_equipment_glucometer D5_equipment_haemoglobinometer D5_equipment_centrifuge D5_7 D5_8 D6_10c D10_mana_shakti D6_11c D7_devices D7_3 IND_23 D10_jas_constituted D10_jas_state D10_vhsnc_state IND_30 D11_district_visits D11_biometric D11_suggestion_box D11_grievance""".split()
SC_KEYS={2:'D1_construction_year',3:'D1_building_condition',11:'D1_toilet_disability_friendly',44:'D7_devices_v2'}
EXTRA={3:'building_condition',7:'electricity',8:'potable_water_24x7',12:'toilet_repair',18:'drainage_functional',20:'doors_windows_repair',21:'premises_clean'}
# Publish only remarks composed entirely of reviewed operational vocabulary.
WORDS=set("""a an the is are was were has have had to be being in at on by with from of for and or but as it due since only all some there this that no not yes na none available unavailable availability notavailable absent missing nil partial partially fully adequate inadequate insufficient proper separate common shared male female disabled friendly accessible toilet toilets bathroom washroom ramp ramps rail railing rails water supply electricity electric electrical connection drainage drain door doors window windows broken damage damaged repair repairs repairing repaired required requires needs need major minor special work works working functional functioning nonfunctional installed installation pending under construction ongoing building premises old new rent rented government own owned phc sc subcentre subcenter centre center co located colocated shifted services given provided providing floor room space open land dispute disputed boundary wall compound branding paint painting solar panel battery power supply kit kits strip strips stock out glucometer haemoglobinometer hemoglobinometer machine equipment cell counter biochemistry semi automated analyser analyzer reagent reagents expired calibration maintenance done regular irregular device devices internet network signal poor mobile desktop tablet laptop printer post posts vacant filled vacancy staff sanctioned doctor doctors cho anm mpw nurse shortage record records register data information incomplete maintained updated found reported submitted meeting meetings held conducted constituted committee grievance suggestion box approved approval requested process progress awaiting fund funds funding sanctioned separate facility facilities health hospital delivery opd ipd emergency currently present presently temporary temporarily closed dismantled needs reconstruction dilapidated inaccessible used use as per recommendation recommended replacement replaced awaiting supplier procurement procure purchased purchase distribution distribution supply supplied notyet provided महिन्यात नाही उपलब्ध इमारत नाहीत आहे काम सुरू सुरु बांधकाम दुरुस्ती आवश्यक अपूर्ण जागा स्वतंत्र शौचालय पाणी वीज नाहीये नादुरुस्त बंद चालू उपलब्धता सध्या केंद्र उपकेंद्र येथे अभावी""".split())
def public_remark(value):
    if not isinstance(value,str) or not value.strip(): return ''
    v=value.strip()
    words=re.split(r'[\s.,;:()/&+–—-]+',v.casefold())
    if len(v)<=450 and all(w in WORDS for w in words if w) and any(words): return v
    return 'Remark available in the assessment record'

def number(v):
    try:
        n=float(str(v).strip())
        return n if 0<=n<1e8 else None
    except (ValueError,TypeError): return None

def assess(i,kind,a,extra,remark_text=public_remark):
    sc=kind=='SC'
    prefix='S_' if sc else ''
    def read(key):
        for suffix in (['_yn.v','.v','.total'] if sc else ['.v','.total']):
            v=a.get(prefix+key+suffix)
            if v is not None and v!='':return str(v).strip()
        return ''
    key=SC_KEYS.get(i,FIELDS[i]) if sc else FIELDS[i]
    v=read(key)
    if i==44 and not v and sc: v=read(FIELDS[i])
    if not sc and i in EXTRA and v.lower() in ('','unknown','not known',"don't know"):v=str(extra.get(EXTRA[i]) or '')
    remark=remark_text(a.get(prefix+key+'_yn.r') or a.get(prefix+key+'.r'))
    evidence=''
    gap=None
    if sc and i in (18,19) and read('D1_drainage_available')=='No':
        return ('1' if i==18 else '-'), 'Drainage absent', remark_text(a.get('S_D1_drainage_available.r'))
    if i==1 or (sc and i==2):
        ownership=read('D1_1_1')
        if ownership!='Government owned':return '-', '', ''
    if i==0:
        if v in ('Government owned','Panchayat building','Rented','Others (specify in remarks)'):gap=v!='Government owned'
    elif i==2:
        n=number(v)
        if n and 1800<=n<=2026:gap=2026-n>40;evidence=f'Built {int(n)}'
    elif i==3:
        if v in ('Good','Repair not required','Needs minor repair','Needs major repair','Needs special repair'):
            gap=v in ('Needs major repair','Needs special repair');evidence=v
    elif i==16:
        if v in ('Functional','Non-functional'):gap=v!='Functional';evidence=v
        elif read('D1_solar')=='No': gap=True;evidence='Solar electricity absent'
    elif i in (23,24):
        sanctioned=filled=0
        for cadre in ('mbbs','bams'):
            n=number(read('STAFF_'+cadre+'_count'))
            if n is None or not n.is_integer() or n>10:break
            slots=[read(f'STAFF_{cadre}_{j}') for j in range(1,int(n)+1)]
            if any(x not in ('Vacant','Filled') for x in slots):break
            sanctioned+=int(n);filled+=slots.count('Filled')
        else:
            gap=filled==0 if i==23 else (sanctioned,filled) in ((3,2),(3,1),(2,1)) or (filled==0 and sanctioned>0)
            evidence=f'{filled} filled / {sanctioned} sanctioned'
    elif i in (25,26,27):
        keys={25:('male',3),26:('female',1),27:('sweeper',1)}
        cadre,n=keys[i];slots=[read(f'STAFF_{cadre}_{j}') for j in range(1,n+1)]
        if all(x in ('Vacant','Filled') for x in slots):gap='Filled' not in slots;evidence=f'{slots.count("Filled")} filled'
    elif i in (28,50,51):
        n=number(v)
        if n is not None:gap=n<50 if i==28 else n<3 if i==50 else n==0;evidence=f'{n:g}'
    elif 29<=i<=32:
        if v:
            drug=['arv','ars','asv','hydroxyurea'][i-29];gap=drug in v.lower()
            if gap:evidence='Listed out of stock'
    elif i==33:
        match=re.fullmatch(r'(\d+)\s*(?:days?|दिवस)?',v,re.I)
        if match:days=int(match[1]);gap=days<30;evidence=f'{days} days'
    elif i==44:
        if re.search(r'desktop|laptop|tablet|printer|smartphone',v,re.I):gap=False
        elif v.casefold() in ('no','none','no device available','no devices available'):gap=True;evidence='No device'
    elif i==54:
        if re.search(r'\bno\b|\bnot\b|नाही',v,re.I):gap=True;evidence='Negative response'
        elif re.search(r'register|meeting|104|complaint box|committee|नोंदवही|^yes$|^होय$',v,re.I):gap=False
    elif v in ('Yes','No','Partial','Partially'):
        if i in (1,4,12,19,20):gap=v=='Yes'
        elif i in (6,21,22):gap=v=='No'
        else:gap=v!='Yes'
        evidence=v
    return ('?' if gap is None else '1' if gap else '0'),evidence,remark
