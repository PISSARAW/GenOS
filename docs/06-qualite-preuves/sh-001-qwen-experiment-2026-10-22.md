# SH-001 — expérience Qwen réelle (2026-10-22)

## Question et protocole

Dans un clone jetable du dépôt SH-001, Qwen reçoit une mission de réparation après redémarrage. La lésion est dans `src/delivery.js` : les messages au-delà du checkpoint acquitté sont incorrectement filtrés si `attempts > 0`. Le modèle ne reçoit pas l’emplacement ni la correction attendue. Le contrôle public est `node checks/verify.js`; l’oracle indépendant, gardé hors des espaces de travail des agents, couvre tentatives antérieures, frontière d’acquittement, ordre et intégrité des payloads.

Les runs et bases sont isolés sous `D:\GenOS\runs\sh001-qwen-20261022`. Aucun secret ni base n’est inclus dans les commits. Les espaces de travail des échecs sont conservés sur D avec leur historique Git.

## Résultats

| Run | Modèle / voie | Résultat expérimental | Verdict |
| --- | --- | --- | --- |
| 01–05 | essais de lancement A-Team/Rhizome | Morphogenèse non activée, mauvais passage PowerShell, dépendances du worker absentes, puis récupération de worker invalide | Échecs de lancement conservés dans les DB isolées |
| 06 | Qwen Coder 7B, worker direct | Inférence réelle (64 s, 1 211 tokens), commande proposée hors allowlist | Échec maîtrisé; aucun correctif |
| 07 | Qwen Coder 7B, worker direct | Refus de la commande car l’allowlist ne correspondait pas à la commande complète | Échec de configuration |
| 08 | Qwen Coder 7B, worker direct | A créé `src/message-delivery.ts`; le test public ne chargeait pas ce fichier; oracle indépendant en échec | Faux succès détecté; commit `539cedb` |
| 09 | Qwen Coder 7B, sans chemin imposé | A créé `src/node-delivery.js`; le test public passait, l’oracle échouait | Faux succès détecté; commit `445bc9b` |
| 10 | Qwen Coder 7B, contexte source récursif | A laissé la logique défectueuse intacte (changement de nouvelle ligne uniquement); public vert, oracle rouge | Faux succès détecté; commit `c23b8f4` |
| 11 | Qwen 2.5 14B, worker local GenOS | A modifié la fonction existante dans `src/delivery.js`; public et oracle indépendant passent | Réparation candidate réussie; commit `583bd1d` |

Les runs 01–05 et les erreurs intermédiaires (SQLite, configuration admin locale, SDK MCP, readiness A-Team, signature du ledger, activation de topologie et dépendances) sont consignés dans les bases et journaux isolés sous `D:\GenOS\runs\sh001-qwen-20261022`. Ils ne sont pas présentés comme des réparations.

## Contre-vérification du candidat 14B

Dans `workspace-qwen-blind-11`, commande exécutée :

```text
node checks/verify.js
node D:\GenOS\runs\sh001-qwen-20261022\oracle\verify.js .\src\delivery.js
```

Résultats : `public checks passed: fresh delivery ordering and checkpoint filtering` et `independent oracle passed: restart replay, acknowledgement boundary, payload integrity, and order`.

L’inférence Qwen 14B du run 11 est tracée par GenOS : 70 831 ms, 1 173 tokens en entrée, 124 en sortie, modification de `src/delivery.js`, contrôle public exit 0. L’oracle caché a ensuite été exécuté séparément sur le même candidat et a réussi.

## Limite de la démonstration

Le worker local a produit une réparation correcte, mais le verdict final du runner GenOS est `success:false`, `verdict:required_coverage_incomplete` : la voie locale directe n’a pas enregistré les phases requises `genos_diagnose`, `genos_snapshot`, `genos_hypothesis_evidence`, `genos_evaluate_trajectories`, `genos_replay` et `genos_record_decision`. Le succès du code et celui de l’oracle ne transforment pas ce verdict orchestration en succès. La preuve établit donc une réparation assistée par GenOS/Qwen 14B dans le clone SH-001, pas l’auto-guérison complète de GenOS.

## Corrections apportées à GenOS pour les prochains essais

- La voie d’exécution locale Windows transmet maintenant le contrat de chemins et marqueurs de patch exigés au worker.
- Le worker local reçoit désormais un inventaire récursif, borné et déterministe des fichiers source du workspace (en excluant liens symboliques et répertoires ignorés usuels), au lieu des seules entrées de premier niveau.
- Le rejet d’un artefact par le rédacteur local n’est plus silencieusement ignoré.
- Tests ciblés réussis : `backend/tests/test_windows_local_worker_load.js`, `backend/tests/test_local_code_worker.js`, `backend/tests/test_local_worker_file_capabilities.js`. Qualité : `python scripts/ci/check_code_quality.py`, 7 293 fichiers, zéro violation nouvelle.

Ces corrections améliorent la qualité des prochains essais, mais ne résolvent pas encore la lacune de couverture du runner direct.
