import json

with open('clippy.json') as f:
    data = [json.loads(line) for line in f if line.strip()]

msgs = [m['message'] for m in data if m.get('reason') == 'compiler-message' and m['message']['level'] in ('error', 'warning')]
for m in msgs:
    if m.get('spans'):
        print(f"{m['spans'][0]['file_name']}:{m['spans'][0]['line_start']} - {m['code']['code'] if m.get('code') else m.get('rendered', m.get('message', ''))}")
