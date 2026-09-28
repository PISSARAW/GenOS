import sys
import re

def translate(text):
    text = text.replace("Protocole de test empirique", "Empirical test protocol")
    text = text.replace("pour les Concepts", "for Concepts")
    text = text.replace("ajout du Lot", "Add Lot")
    text = text.replace("concepts nouvellement implementes", "newly implemented concepts")
    text = text.replace("ajout des explications sur", "Add explanations on")
    text = text.replace("Int??gration de la validation empirique", "Integrate empirical validation")
    text = text.replace("Int�gration de la validation empirique", "Integrate empirical validation")
    text = text.replace("et du protocole de test pour Agent IA", "and test protocol for AI Agent")
    return text

msg = sys.stdin.read()
lines = msg.split('\n')
if not lines:
    sys.exit(0)
    
title = lines[0]
bracket = re.match(r'^\[([A-Za-z]+)\]\s*(.*)$', title)
if bracket:
    tag = bracket.group(1).upper()
    rest = translate(bracket.group(2).strip())
    lines[0] = f'[{tag}] {rest}' if rest else f'[{tag}]'
else:
    match = re.match(r'^(?:feat|fix|docs|chore|refactor|test|style|perf|build|ci)(?:\([^)]+\))?:\s*(.*)', title, re.IGNORECASE)
    if match:
        kind = re.match(r'^([A-Za-z]+)', title).group(1).upper()
        new_title = translate(match.group(1).strip())
        lines[0] = f'[{kind}] {new_title}' if new_title else f'[{kind}]'
    
sys.stdout.write('\n'.join(lines))
