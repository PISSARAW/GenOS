# Campagne réelle — Cycle génome / AgentDNA avec Ollama (2026-10-23)

**Objectif** : exercer le cycle avec un LLM réel (Ollama qwen2.5-coder:7b) sur une mission réelle.
**Configuration** : `.env.campagne` (PORT=4010, GENOS_DB_PATH=campagne-reelle.db, GENOS_AGENT_DNA=1, GENOS_AGENT_DNA_REQUIRE_SIGNED=0, GENOS_LOCAL_MODEL=ollama://qwen2.5-coder:7b).
**Mission** : « Analyser le fichier README.md et produire un resume en 3 points » (background).

## Résultats

| Indicateur | Valeur |
|---|---|
| Missions créées | 2 |
| Agents créés | 1 |
| agent_genomes (total) | 1 (le parent importé) |
| agent_genome_innovations | 0 |
| agent_genome_selections | 0 |
| WORKER_CAPABILITY_LEASED events | 0 |
| Génome utilisé dans la mission | **Non** |

## Constat

La mission s'est exécutée (2 missions, 1 agent créé) mais le cycle AgentDNA n'a **pas été exercé** :
- Aucun génome n'a été sélectionné pour un worker (`agent_genome_selections = 0`).
- Aucune innovation n'a été capturée (`agent_genome_innovations = 0`).
- Aucun événement `WORKER_CAPABILITY_LEASED` n'a été émis.
- Le backend n'a loggué aucune mention de génome/DNA.

## Causes possibles

1. La mission n'a pas déclenché d'incarnation de worker via `incarnateAgent` (chemin qui appelle `buildDna`/`selectForIncarnation`).
2. Le parent-genome (role `historian`) ne matche pas le rôle de la mission (aucun worker avec role `historian` créé).
3. `bestMatch` retourne null (score < 3) car le phénotype du parent ne matche pas la mission.
4. Le génome n'est sélectionné que si un worker est incarné avec un rôle compatible.

## Conclusion

**Même avec GENOS_AGENT_DNA=1 et un LLM réel, le cycle AgentDNA n'a pas été exercé sur cette mission.** Cela confirme que la capacité est non exercée en production, non pas par manque de code, mais par absence de chemin d'incarnation de worker compatible dans le flux de mission réel.

La démonstration contrôlée (campagne 5 agents) reste la seule preuve fonctionnelle du cycle ; la campagne réelle n'a pas exercé le génome.

## Nettoyage

- Backend arrêté.
- DB de campagne conservée : `backend/campagne-reelle.db`.
- Fichiers temporaires : `.env.campagne`, `backend/launch_campagne.bat`, `backend/launch_mission.bat`.