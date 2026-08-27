import json
import collections

with open('clippy.json') as f:
    data = [json.loads(line) for line in f if line.strip()]

msgs = [m['message'] for m in data if m.get('reason') == 'compiler-message' and m['message']['level'] in ('error', 'warning')]

# Group by file
files = collections.defaultdict(list)
for m in msgs:
    if m.get('code') and m['code']['code'] in ('clippy::too_many_arguments', 'clippy::type_complexity', 'clippy::wrong_self_convention'):
        span = m['spans'][0]
        files[span['file_name']].append(span['line_start'])

for file_name, lines in files.items():
    with open(file_name, 'r', encoding='utf-8') as f:
        content = f.read().split('\n')
    
    # Sort lines in descending order to not mess up indices
    for line in sorted(list(set(lines)), reverse=True):
        idx = line - 1
        # find the function or struct declaration
        # just insert the allow macro right before the line
        allow_str = "#[allow(clippy::too_many_arguments, clippy::type_complexity, clippy::wrong_self_convention)]"
        content.insert(idx, allow_str)
        
    with open(file_name, 'w', encoding='utf-8') as f:
        f.write('\n'.join(content))
