import json, os, sqlite3, sys
from pathlib import Path
base=Path(os.environ.get('GENOS_REGULATION_OUTPUT_DIR', Path(__file__).resolve().parents[4]/'regulation-probe-results'))
name=sys.argv[1] if len(sys.argv)>1 else 'resultats-workers-recuperes.json'
summary=json.loads((base/'outputs'/name).read_text(encoding='utf-8'))
con=sqlite3.connect(str(Path(summary['runRoot'])/'genos.db'))
rows=[]
for r in summary['results']:
    aid=r['workerId']
    counts=dict(con.execute("select event_type,count(*) from telemetry_events where agent_id=? and json_extract(payload_json,'$.executionRunId')=? group by event_type",(aid,r['runId'])).fetchall())
    rows.append({'kind':r['kind'],'workerId':aid,'runId':r['runId'],'runStatus':r['runStatus'],
                 'startedEvents':counts.get('DETERMINISTIC_WORKER_STARTED',0),
                 'evidenceReports':counts.get('EVIDENCE_REPORT',0),
                 'completedEvents':counts.get('AGENT_COMPLETED',0)})
out={'schema':'genos.real-worker-event-audit/v1','workers':rows,
     'allLifecycleEvents':all(x['startedEvents']>=1 and x['evidenceReports']>=1 and x['completedEvents']>=1 for x in rows)}
(base/'outputs'/'audit-workers-genos.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print('workers',len(rows),'allLifecycleEvents',out['allLifecycleEvents'])
print('evidence reports',sum(x['evidenceReports'] for x in rows))
