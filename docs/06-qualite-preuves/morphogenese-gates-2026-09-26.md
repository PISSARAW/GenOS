# Gates morphogenèse — phases 1, 2, 2b, 3–10 (2026-09-26)

- **Statut** : Résultats mesurés localement
- **Portée** : compilation IR, 8 opérateurs, 8 topologies, transferts, patchs, variantes, mémoire
- **Date** : 2026-09-26

---

## 1. Protocole

Gate A (versionné, sans stubs ni SQLite) :
`backend/tests/test_morphology_graph_execution.js`
(`node backend/tests/test_morphology_graph_execution.js`).

Gate B (manuel, exige SQLite — natif ou repli `node:sqlite`) : expressions
`NEST`/`SEQUENCE`/`COMPETE`/`BRIDGE` sur les 8 topologies via
`installTopologyPlugins`, inputs explicites par contrat de feuille
(ballots Biocénose, `capability`+exécuteur+allocation Holobionte, mission
Métapopulation). Environnement de mesure : Windows ARM64, Node 22.23.3,
binaire `sqlite3` natif inutilisable (arch x64) → pilote `node-sqlite-shim`.

## 2. Résultats

| Gate | Attendu | Observé |
| --- | --- | --- |
| `NEST(A-Team,PARALLEL(Trinity,Rhizome))` | 5 nœuds, budgets 100→50/50→25/25, 2 sorties branches | OK, `receipts=3` (host+inner+nest) |
| `SEQUENCE(PARALLEL,GATE,A-Team)` | sortie A-Team, reçu gate complet | OK, `PARALLEL,GATE,SEQUENCE` + 5 feuilles, `selected else / rejected then + confidence + reason` |
| `COMPETE(Trinity,Rhizome)` | gagnant + protocole + budgets comparables | OK, gagnant Trinity |
| `BRIDGE` contrat violé | refus fermé | OK (`contract violated, missing: …`) |
| `BRIDGE` bundle | `TransferBundle` + préservation | OK |
| 8 racines | sorties réelles | OK (trinity `verified_claims`, rhizome `path_1`, syncytium `converged`, biocénose `approved`, biome `growing`, holobionte `VERIFIED rev 6`, métapop `VERIFIED`) |
| `changeVariant` | patch vérifié, version+1 | OK (`null→adversarial`, v1→v2) |
| op inconnue (`TELEPORT`) | refus | OK |
| expérience | 1 enregistrement, exécution intacte | OK |
| topologie inconnue | `not registered` | OK |

## 3. Limites

- Gate B non rejoué en CI au moment de l'écriture (scripts ad hoc hors
  dépôt) ; seul le gate A est versionné et rejouable.
- Pilote `node-sqlite-shim` (expérimental) au lieu du natif dans cet
  environnement ; CI/prod attendus sur natif.
- Cycle Métapopulation sur région vide : `VERIFIED` avec `actionCount 0`
  (inactivité honnête, pas efficacité).
- Exécuteur de capacité Holobionte fourni par la mission (design du
  runtime) : le cycle plan→vérification→ledger est réel, la capacité
  elle-même est du ressort mission.
- Aucune comparaison humain-vs-machine ni campagne multi-missions :
  ces gates prouvent l'exécution, pas la supériorité.
