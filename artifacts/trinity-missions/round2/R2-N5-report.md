# R2-N5 — 12 pièces, 3 pesées (variant adversarial réel)

**Verdict : PARTIEL-INTÉRESSANT** — pour la première fois, la chambre de falsification tire dans la bonne direction : W2 produit la solution séduisante-fausses (4-4-4) et W3 `adversarial_reviewer` la rejette (cas non couverts). Rejet correct mais non démontré ; escalade correcte.

## 1. Lancement et variant (vérifié)

- Commande : `node artifacts/trinity-missions/launch_real.cjs N5 adversarial`
- Orchestrateur : `mcp_orchestrator_8722f056` — dispatch 17:47:04, accepté.
- Receipt : variant `adversarial`, design `trinity-design-v1-f2516d8e307d53ab`, `interactionPolicy=adversarial_cross_examination`.

## 2. Workers utilisés (vérifié en DB)

| Monde | Rôle | WorkerKind | Durée |
|---|---|---|---|
| 1 | basic_implementation | bounded_worker | 17:47:52 → 17:48:10 (~18 s) |
| 2 | interview_plan_implementation | specialist | 17:47:43 → 17:48:00 (~17 s) |
| 3 | adversarial_reviewer | red_worker (« Verify · … ») | 17:47:44 → 17:48:03 (~19 s) |

## 3. Réponses des mondes

- **W1** : 10 claims affirmant « stratégie couvre les 24 cas » + evidences `genos-inbox-check.cjs`, `genos-autoscan.js` (fichiers inexistants comme preuves — fabrication sanctionnée à 0), **sans jamais donner l'arbre de pesées**. Revendication sans substance.
- **W2** : donne une vraie procédure : 3 groupes de 4, peser 4 vs 4… puis « peser deux pièces de ce groupe » en 3e pesée pour 4 suspects de sens inconnu — **insuffisant** (c'est exactement la solution séduisante-fausse : 4 suspects × 2 sens = 8 cas > 3 issues). Evidences `requirement`/`conformance`/`effectiveness` (labels, poids 0).
- **W3** (red_worker) : `verification_report` verdict `reject` — « il existe des cas non couverts par cette stratégie adaptative ». **Direction correcte** (la 4-4-4 est bien fausse), mais sans exhiber le contre-exemple (ex. : 1re pesée équilibrée → 4 suspects inconnus, une seule pesée restante). Falsification d'intention juste, de démonstration nulle.

## 4. Comparaison et décision

- `TRINITY_WORLD_COMPARISON_RECORDED` 17:48:11 : `ESCALATE_EXPERIMENT`, `canMerge=false`. Scores bas partout (refs non résolvables). Correct : ni la revendication vide (W1) ni le rejet non démontré (W3) ne sont fusionnables.

## 5. Replay

```
node artifacts/trinity-missions/launch_real.cjs N5 adversarial
node artifacts/trinity-missions/check_mission.cjs "12 pièces"
node artifacts/trinity-missions/recompare_live.cjs "(N5"
```

## 6. Télémétrie

- Dispatch → compared : ~67 s (17:47:04 → 17:48:11). LLM 17–19 s/monde.

## 7. Schéma de communication observé

Dispatch adversarial → W1/W2 (bounded/specialist, construction) + W3 red_worker (falsification, aveugle — pas de phase 2 nourrie des dossiers, suivi ADR 0279) → comparateur → ESCALATE + publish.

## 8. Étapes

Compose adversarial (W3 en `adversarial_reviewer`) → garage → workers → rapports (revendication / procédure 4-4-4 / rejet) → comparaison → escalade → vérification (dont analyse manuelle de la procédure W2 : fausse, comme prévu par la mission).

## 9. Budget

3 runs ollama parallèles, ~67 s murales, 0 $.

## 10. Avant/après fixes

- R1 : `adversarial_review_prep` de repli, W3 déclarant le problème **insoluble** (faux). R2 : vrai adversarial, W3 `red_worker` rejetant à raison (mais sans preuve), W2 produisant ENFIN une procédure réfutable (fausse, donc la mission-test fonctionne : il y a quelque chose à falsifier). Premier round où la topologie adversarial montre son rôle.
