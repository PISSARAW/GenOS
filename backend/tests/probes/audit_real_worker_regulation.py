import json, sqlite3
from pathlib import Path
base=Path(__file__).resolve().parent/'.regulation-results'
summary=json.loads((base/'outputs'/'resultats-workers-genos.json').read_text(encoding='utf-8'))
con=sqlite3.connect(str(Path(summary['runRoot'])/'genos.db'))
rows=[]
for r in summary['results']:
    aid=r['workerId']
    counts=dict(con.execute('select event_type,count(*) from telemetry_events where agent_id=? group by event_type',(aid,)).fetchall())
    rows.append({'kind':r['kind'],'workerId':aid,'runId':r['runId'],'runStatus':r['runStatus'],
                 'startedEvents':counts.get('DETERMINISTIC_WORKER_STARTED',0),
                 'evidenceReports':counts.get('EVIDENCE_REPORT',0),
                 'completedEvents':counts.get('AGENT_COMPLETED',0)})
out={'schema':'genos.real-worker-event-audit/v1','workers':rows,
     'allLifecycleEvents':all(x['startedEvents']>=1 and x['evidenceReports']>=1 and x['completedEvents']>=1 for x in rows)}
(base/'outputs'/'audit-workers-genos.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print('workers',len(rows),'allLifecycleEvents',out['allLifecycleEvents'])
print('evidence reports',sum(x['evidenceReports'] for x in rows))
