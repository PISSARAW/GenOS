@echo off
:: Lance le daemon résident GenOS sur le territoire C: (Github local)
:: Base partagee du backend (ADR 0290) : GENOS_DB_PATH n'est pas force ici,
:: le daemon resout la meme base que le backend et l'orchestrateur.
set GENOS_DB_BACKUP_SKIP=1
cd /d "C:\Users\Shadow\Documents\GitHub\GenOS"
"C:\Program Files\nodejs\node.exe" backend\bin\genos-daemon.cjs --territory territory.github-c --daemon-id daemon-local-github-c
