# -*- coding: utf-8 -*-
"""Convert the baseline workbook to a MasterPayload JSON for local seeding."""
import openpyxl, json, sys
wb=openpyxl.load_workbook('artifacts/BASELINE TEST MASTER - not live.xlsx')
def rows(sheet):
    ws=wb[sheet]
    data=list(ws.iter_rows(min_row=5,values_only=True))
    return [r for r in data if any(v not in (None,'') for v in r)]
yn=lambda v:str(v or '').strip().lower() in ('yes','true','y','1')
s=lambda v:'' if v is None else str(v).strip()
def T(v):
    x=s(v)
    if ':' in x:
        h,m=x.split(':')[0:2]; return f'{int(h):02d}:{m[:2]}'
    return x
payload={'source':'excel','sourceVersion':'local-seed-1','people':[],'sections':[],'jobs':[],
 'guest':{'categories':[],'groups':[],'guests':[],'agenda':[],'travelPlans':[],'travelStops':[],'hotels':[]}}
for r in rows('1 People'):
    payload['people'].append({'recordId':s(r[7]),'initials':s(r[0]),'fullName':s(r[1]),'responsibility':s(r[2]),
     'employeeNumber':s(r[3]).split('.')[0],'phone':s(r[4]),'isCore':yn(r[5]),'removed':yn(r[6])})
for r in rows('2 Sections'):
    payload['sections'].append({'recordId':s(r[3]),'number':int(float(r[0])),'heading':s(r[1]),'removed':yn(r[2])})
for r in rows('3 Jobs'):
    # ['The job','Under which heading','Who is responsible','Where','FINISH BY','Notes','Remove?','ID']
    fin=s(r[4]); fin=fin[:10] if fin else ''
    payload['jobs'].append({'recordId':s(r[7]),'title':s(r[0]),'sectionHeading':s(r[1]),
     'responsibleInitials':[x.strip() for x in s(r[2]).replace('/',',').split(',') if x.strip()],
     'location':s(r[3]) or 'General','finishBy':fin,'notes':s(r[5]),'removed':yn(r[6])})
g=payload['guest']
for r in rows('4 Guest Categories'):
    g['categories'].append({'recordId':s(r[2]),'name':s(r[0]),'removed':yn(r[1])})
for r in rows('5 Guest Groups'):
    g['groups'].append({'recordId':s(r[4]),'name':s(r[0]),'primaryInitials':s(r[1]),'secondaryInitials':s(r[2]),'removed':yn(r[3])})
for r in rows('6 Guests'):
    g['guests'].append({'recordId':s(r[11]),'name':s(r[0]),'company':s(r[1]),'categoryName':s(r[2]),
     'groupName':s(r[3]),'country':s(r[4]),'preferredLanguage':s(r[5]).lower(),
     'phone':s(r[6]),'email':s(r[7]),'malur':yn(r[8]),'taj':yn(r[9]),'removed':yn(r[10])})
for r in rows('7 Group Agenda'):
    d=s(r[1])[:10]
    g['agenda'].append({'recordId':s(r[6]),'groupName':s(r[0]),'date':d,'time':T(r[2]),'title':s(r[3]),'details':s(r[4]),'removed':yn(r[5])})
for r in rows('8 Travel Plans'):
    g['travelPlans'].append({'recordId':s(r[10]),'name':s(r[0]),'event':s(r[1]).lower(),'date':s(r[2])[:10],
     'categoryNames':[x.strip() for x in s(r[3]).split(',') if x.strip()],'mode':s(r[4]),'routeName':s(r[5]),
     'vehicleNumber':s(r[6]),'driverName':s(r[7]),'driverPhone':s(r[8]),'removed':yn(r[9])})
for r in rows('9 Travel Stops'):
    g['travelStops'].append({'recordId':s(r[5]),'travelPlanName':s(r[0]),'order':int(float(r[1])),'time':T(r[2]),'place':s(r[3]),'removed':yn(r[4])})
for r in rows('10 Hotels'):
    rh=r[2]
    g['hotels'].append({'recordId':s(r[4]),'name':s(r[0]),'address':s(r[1]),
     'roomsHeld':int(float(rh)) if rh not in (None,'') else None,'removed':yn(r[3])})
json.dump(payload,open('/tmp/master-payload.json','w'))
print('people',len(payload['people']),'sections',len(payload['sections']),'jobs',len(payload['jobs']),
 'cats',len(g['categories']),'groups',len(g['groups']),'guests',len(g['guests']),
 'agenda',len(g['agenda']),'plans',len(g['travelPlans']),'stops',len(g['travelStops']),'hotels',len(g['hotels']))
