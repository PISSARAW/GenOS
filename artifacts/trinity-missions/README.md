# Trinity — Campagne 6 missions (2026-10-03)

Lancements réels via `trinityService.compose` + `topologyWorkerKindService.applyTopologyWorkerKinds`. Mondes scellés simulés (dossiers déterministes), composition/variant/workerKinds 100 % réels.

| Mission | Variant | DesignId | Workers (rôle → kind) | Verdict |
|---|---|---|---|---|
| N1 cold-start | adversarial | trinity-design-v1-925fdecc6e538ea0 | data_eng→bounded/specialist/verifier | RÉUSSITE |
| N2 corbeaux | heterogeneous | trinity-design-v1-3a57155c4a83823c | basic→bounded/specialist/adaptive | RÉUSSITE |
| N3 lenteurs | controlled | trinity-design-v1-fa00945a3cd8fa76 | basic→bounded/specialist/adaptive | RÉUSSITE |
| N4 finance | pareto | trinity-design-v1-2e53048a0b50f69d | secu→bounded/specialist/red_worker | RÉUSSITE |
| N5 12 pièces | adversarial | trinity-design-v1-f2516d8e307d53ab | basic→bounded/specialist/adaptive | RÉUSSITE |
| N6 trajet Pareto | pareto | trinity-design-v1-7243def66c87743e | basic→bounded/specialist/adaptive | RÉUSSITE partielle (non benchmarké) |

## Replay global
```
node artifacts/trinity-missions/run_all.cjs
node artifacts/trinity-missions/run_all.cjs --only N1  # ... N2..N6
```
Receipts : `receipts/N1.json` … `receipts/N6.json`. Missions : `missionN1.txt` … `missionN6.txt`. Dossiers : `N1-report.md` … `N6-report.md`.

## Budget global
6 missions × 3 mondes × 1500 tokens simulés = 27 000 tokens simulés, ~0,3 s CPU local, 0 appel LLM distant, coût ≈ 0. Aucun agent vivant spawn (pas de `dispatch_trinity` DB) : choix volontaire de reproductibilité.

## Schéma de communication (toutes missions)
```
[Mission] --> [W1 direct] --dossier scellé--> [Comparateur/Juge] --> synthèse
[Mission] --> [W2 structured] --dossier scellé--> [Comparateur/Juge] --> synthèse
[Mission] --> [W3 falsification] --attaques/counter-examples--> [Comparateur/Juge] --> synthèse
```
Trois chemins initiaux réellement divergents (chambres, rôles, kinds distincts), confrontation après clôture uniquement.

## Observation demandée
Trinity ne s'est pas réduit à « trois agents qui discutent » : les receipts montrent des designs distincts par mission (adversarial_cross_examination vs heterogeneous vs pareto_orthogonal vs baseline) et des workerKinds distincts par chambre.
