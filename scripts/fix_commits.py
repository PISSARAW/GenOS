import sys
import re

def translate(text):
    text = text.replace("Protocole de test empirique", "Empirical test protocol")
    text = text.replace("pour les Concepts", "for Concepts")
    text = text.replace("ajout du Lot", "Add Lot")
    text = text.replace("concepts nouvellement impl??ment??s", "newly implemented concepts")
    text = text.replace("concepts nouvellement implémentés", "newly implemented concepts")
    text = text.replace("ajout des explications sur", "Add explanations on")
    text = text.replace("Int??gration de la validation empirique", "Integrate empirical validation")
    text = text.replace("Intégration de la validation empirique", "Integrate empirical validation")
    text = text.replace("et du protocole de test pour Agent IA", "and test protocol for AI Agent")
    return text

msg = sys.stdin.read()
lines = msg.split('\n')
if not lines:
    sys.exit(0)
    
title = lines[0]
match = re.match(r'^(?:feat|fix|docs|chore|refactor|test|style|perf|build|ci)(?:\([^)]+\))?:\s*(.*)', title, re.IGNORECASE)

if match:
    new_title = match.group(1).strip()
    new_title = translate(new_title)
    if new_title:
        new_title = new_title[0].upper() + new_title[1:]
    lines[0] = new_title
    
sys.stdout.write('\n'.join(lines))
