# Coopération LLM : deux plans refusés avant dispatch

- **Date** : 2026-11-04.
- **Statut** : échec réel de qualification, diagnostic conservé.
- **Source** : commit `7de888d769630b94f635758ab703a36ead4f0ded`.
- **Modèle** : Qwen 2.5 Coder 7B, digest
  `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
- **Runtime** : Ollama 0.40.12, serveur dédié et données sur D:.

## Résultats mesurés

| Essai | Plan réel | Tokens entrée / sortie | Temps pilote |
| --- | --- | ---: | ---: |
| Commit strict | `observes → proposes → verifier_worker → recovery_worker` | 95 / 94 | 14 910 ms |
| Variante enum seulement | `specialist → verifier_worker → recovery_worker → resident_daemon` | 95 / 96 | 25 047 ms |

Le premier plan contient deux identifiants de types inexistants. Le second emploie
les noms corrects mais place le daemon après la restauration. Le validateur
refuse les deux plans avant tout dispatch : zéro worker, zéro oracle sémantique
et zéro restauration. Les deux appels réels consomment ensemble 380 tokens ;
ce faible coût tient à l'arrêt précoce, pas à une coopération efficace démontrée.

La variante ne modifie que `responseFormat`. La reconstruction des requêtes
confirme des messages et options identiques ; le seul champ différent est
`format`. Elle ne constitue pas une correction committée ni une qualification
réussie du commit source.

## Cause et limites

Le planificateur ne reçoit qu'un catalogue en prose et une demande de dépendances
sûres, alors que le validateur exige un ordre précis et les dépendances directes
sur chaque prédécesseur. Le schéma enum résout le vocabulaire dans ce contre-essai,
mais ne suffit pas à communiquer les préconditions du protocole.

Surtout, le pilote appelle `planning` avant `observe`. Le planificateur ne reçoit
ni le dossier du daemon ni les valeurs et indices du workspace. Il propose une
chaîne générique, sans pouvoir fonder sa réponse sur une détection réelle.

Les sorties sont complètes, mesurées et inférieures au plafond. Ce résultat ne
démontre ni une perte de contexte entre workers, ni une incapacité générale du
modèle à calculer : aucun worker n'a été lancé. Le refus protège le dispatch,
mais la détection, la solution, le contrôle indépendant et la récupération
restent non requalifiés par ces deux essais.

## Intégrité et arrêt

L'audit SQLite en lecture seule confirme l'absence de workers, de réservations
worker et de reprises pendantes. Les deux runs racines sont terminaux par arrêt
explicite du pilote ; le motif initial est l'assertion de validation du plan,
pas ce statut de clôture. Aucun `SQLITE_MISUSE` n'est observé.

Le serveur Ollama dédié et son enfant sont arrêtés ; une vérification différée
confirme leur absence et la libération du port. Aucun fichier de code suivi du
checkout C: n'a été modifié pendant ces expériences.

Les preuves sont conservées sous
`D:/GenOS-runs/worker-cooperation-real-20261104-105205` : `ANALYSE.md`, les deux
`report.json`, `analysis-evidence.json`, `planner-schema.patch`,
`planner-request-comparison.json`, les journaux Ollama et le manifeste SHA-256.
Les clés privées du run restent hors Git.

## Suite requise

Faire produire le constat vérifié avant la planification, fournir au modèle son
dossier et ses références de source, puis valider un plan des étapes restantes
contre les préconditions effectivement exposées. Le cas sans anomalie doit
permettre un arrêt. Les types restent limités au catalogue existant et aucune
sortie du LLM ne doit conférer elle-même une autorité d'exécution.
