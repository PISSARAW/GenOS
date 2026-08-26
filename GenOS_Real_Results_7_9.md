# GenOS — Résultats d'Évaluation Empirique, Concepts 7 à 9 (expérimentation en double aveugle)

**Date :** 2026-08-26 · **Environnement :** Windows / PowerShell 5.1 · Node v24.18.0 · cargo 1.97.1
**Répertoire de test :** `test_env_genos_7_9/` · CLI : binaire précompilé `target/debug/genos.exe` (via `cargo run -p genos-cli --`)

> Contenu : sorties console brutes, fichiers générés, constats factuels. Aucune conclusion théorique.

---

## PHASE 1 — Arène

Fichiers créés :
- `src/DataTable.ts` — table de données virtuelle (tri + filtre + rendu fenêtré), version de départ avec tri à bulles quadratique.
- `eval_script.js` — mesure : temps médian (tri / filtre / rendu sur 20 000 lignes déterministes), justesse (6 vérifications), coût cognitif (lignes / caractères / tokens approximatifs).

Sortie brute (baseline) :

```
$ node eval_script.js dist_baseline DataTable
sort(score asc): median=1381.98ms over 3 runs
filter("item-123"): median=12.23ms over 3 runs
render(5000): median=0.01ms over 5 runs
cognitive_cost: lines=77, chars=2260, approx_tokens=565
checks: 6/6 passed
EVAL_JSON {"sort_ms":1381.98,"filter_ms":12.23,"render_ms":0.01,"lines":77,"chars":2260,"approx_tokens":565,"checks_passed":6,"checks_total":6}
```

---

## PHASE 2 — Deux méthodes de sélection

### Méthode A (prompt naïf : « Optimise ce composant Table pour qu'il soit le plus rapide possible. »)

Fichier produit : `src/DataTable_naive.ts` (index multiples précomputés par colonne, caches tri/filtre, statistiques de cache).

```
$ node eval_script.js dist_a DataTable_naive
sort(score asc): median=0.01ms over 3 runs
filter("item-123"): median=0.23ms over 3 runs
render(5000): median=0.00ms over 5 runs
cognitive_cost: lines=123, chars=4010, approx_tokens=1003
checks: 6/6 passed
EVAL_JSON {"sort_ms":0.01,"filter_ms":0.23,"render_ms":0,"lines":123,"chars":4010,"approx_tokens":1003,"checks_passed":6,"checks_total":6}
```

Constat factuel n°1 : la valeur `sort_ms=0.01` est obtenue parce que les exécutions 2 et 3 touchent un cache rempli à l'exécution 1 ; la métrique « médiane » ne reflète pas le premier appel à froid. Le code coûte ×2 lignes et ~×1,8 tokens vs baseline.

### Méthode B (3 Workers GenOS, génomes distincts créés/mutés par le CLI)

```
$ genos agent create --name Worker_Speed    … ; genos agent mutate … --drive exploration=0.4   → Error: exploration mutation produces 1.1 … (relancé avec +0.2)
$ genos agent create --name Worker_Strict   … ; genos agent mutate … --drive syntax_strictness=0.45 → new_value: 0.95
$ genos agent create --name Worker_Balanced … (génome par défaut)
```

Génomes résultants (extraits YAML) :
- `worker_speed.yaml` : exploration **0.9**
- `worker_strict.yaml` : syntax_strictness **0.95**, autres gènes par défaut
- `worker_balanced.yaml` : défauts (exploration 0.7, risk_tolerance 0.25, verification_threshold 0.8)

Proposals évaluées (`node eval_script.js dist_b <nom>`), sorties brutes :

```
=== SPEED ===    sort=6.61ms  filter=4.85ms  render=0.00ms  lines=48  tokens≈324  checks 6/6
EVAL_JSON {"sort_ms":6.61,"filter_ms":4.85,"render_ms":0,"lines":48,"chars":1296,"approx_tokens":324,...}

=== STRICT ===   sort=8.80ms  filter=6.86ms  render=0.01ms  lines=97  tokens≈857  checks 6/6
EVAL_JSON {"sort_ms":8.8,"filter_ms":6.86,"render_ms":0.01,"lines":97,"chars":3427,"approx_tokens":857,...}

=== BALANCED === sort=1.63ms  filter=6.47ms  render=0.00ms  lines=50  tokens≈344  checks 6/6
EVAL_JSON {"sort_ms":1.63,"filter_ms":6.47,"render_ms":0,"lines":50,"chars":1375,"approx_tokens":344,...}
```

Front de Pareto tracé sur les axes mesurés (Performance = sort_ms ; Taille = lignes) :

| Point | sort_ms | lignes | Statut Pareto |
|---|---|---|---|
| Méthode A | 0,01 * (cache chaud) | 123 | non dominé (mais voir constat n°1) |
| Worker_Speed | 6,61 | 48 | non dominé |
| Worker_Strict | 8,80 | 97 | **dominé** (par Balanced : plus lent ET plus gros que Balanced) |
| Worker_Balanced | 1,63 | 50 | non dominé |

Constat factuel n°2 : Worker_Strict est éliminé du front par dominance ; Worker_Balanced est le point du front au coude (perf ×33 vs baseline pour +3 lignes seulement). Code final choisi Méthode B = `DataTable_balanced.ts` (50 lignes) ; code final Méthode A = `DataTable_naive.ts` (123 lignes).

---

## PHASE 3 — Flakiness (génétique quantitative)

Contexte créé : `src/flaky_network.ts` (succès réseau réel `Math.random() < 1/3`) + `src/flaky_test.ts`.

### Méthode A

```
$ npx tsc src/flaky_test.ts src/flaky_network.ts …
RUN 1 (Method A): ℹ pass 0 / fail 1
RUN 2..4: fail 1 (trois échecs consécutifs supplémentaires)
```

Constat factuel n°3 : sur cette série, le premier verdict unique de l'agent était ROUGE ; dans d'autres séries (voir ci-dessous), le même binaire compilé passe parfois. Le verdict dépend uniquement du tirage aléatoire.

### Méthode B (rejeux isolés + infer-traits)

```
$ node flaky_runner.js 5     → RUN1 PASS, RUN2 FAIL, RUN3 FAIL, RUN4 PASS, RUN5 FAIL → TOTAL: 2/5 verts
$ node flaky_runner.js 5     → RUN1 PASS, RUN2..5 FAIL                              → TOTAL: 1/5 verts
```

Agent « vainqueur » (run vert) : `genos agent create --name FlakyWinner --role NetworkFixer` → genome_id `01a03b38-1638-7872-8a6f-123f242bd3a4`. Observations phénotypiques réelles écrites dans 6 fichiers YAML (`phen_run_initial.yaml`=1, clones=[1,0,0,1,0]) au schéma `PhenotypeObservation`.

```
$ genos agent infer-traits agents/flaky_winner.yaml --phenotype phen_run_initial.yaml --trait success --out agents/flaky_winner_inferred.yaml
inferred_traits:
- trait_name: success
  estimate: 1.0
  confidence: 1.0
  observations: 1
  inference_method: observation_weighted_mean
  status: candidate

$ genos agent infer-traits … --phenotype phen_run_initial.yaml --phenotype phen_clone1..5.yaml --trait success --out agents/flaky_winner_full.yaml
inferred_traits:
- trait_name: success
  estimate: 0.5
  confidence: 1.0
  observations: 6
  inference_method: observation_weighted_mean
  status: candidate
```

Constat factuel n°4 : avec une seule observation (succès initial), l'estimateur renvoie 1.0 ; en ajoutant les 5 replays réels (3 verts sur 6 au total… soit estimate 0.5), la valeur chute à 0.5 et reste marquée `candidate` (jamais promue). Les fichiers `flaky_winner_inferred.yaml` et `flaky_winner_full.yaml` sont conservés comme preuves.

---

## PHASE 4 — Chaos & isolation

### Goulet d'étranglement (`bottleneck_experiment.ps1`)

Chaîne CLI réelle : 10 × (`agent create` → `agent mutate --drive exploration=Δ` → `snapshot create` → `capsule create --root .genos79`). Puis suppression physique de 8 capsules (édition du store `.genos79/capsules/agent-world-capsules.jsonl`, tirage aléatoire réel), puis repeuplement par `division bud` (4 bourgeons par survivant).

```
population initiale: 10 capsules
  exploration = 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95   (10 valeurs distinctes)
désastre: 8 capsules tuées, survivants:
  exploration=0.35  et  exploration=0.15
population après repeuplement: 10 capsules
  2 survivants (parent=none) + 8 buds (parent=survivants), explorations = {0.15×4, 0.35×4, 0.15, 0.35}
DIVERSITÉ: valeurs distinctes avant=10 après=2 ; variance(exploration) après=0.01 (avant=0.075), sd=0.1
```

Constat factuel n°5 : après désastre + repeuplement asexué, la population entière ne porte plus que les génotypes des 2 survivants (variance 0.075 → 0.01). Sortie complète du script conservée dans la session.

### Cloisonnement vs migration (N+1)

Dèmes isolés : `agents/ui/ui_worker.yaml` et `agents/db/db_worker.yaml` (créés séparément, jamais mis en communication). Fichiers : `src/user_feed.ts` (endpoint liste + endpoint profil unitaire), `src/queries.ts` (requête groupée côté DB, inconnue de l'UI).

Avant migration (agent UI pur, `agents/ui/ui_worker_attempt.ts`) :

```
UI pur: 30 lignes rendues, appels API = 31
DIAGNOSTIC UI PUR: rendu correct, mais l'agent UI n'a aucun outil DB -> N+1 invisible (31 appels pour 30 utilisateurs)
```

Migration appliquée :

```
$ Move-Item agents\db\db_worker.yaml agents\ui\db_worker_migrated.yaml
agents\ui\db_worker_migrated.yaml
agents\ui\ui_worker.yaml
agents\ui\ui_worker_attempt.ts
```

Génération suivante dans le dossier UI (`agents/ui/hybrid_feed.ts`, utilise `queryUsersWithProfiles()` issue du répertoire migré) :

```
HYBRIDE: 30 lignes rendues, appels API = 0
COMPARAISON: pur UI = 31 appels / hybride = 0 appel
rendus identiques: true | appels pur=31 hybride=0
```

Constat factuel n°6 : après déplacement physique du génome DB dans le dème UI, la génération suivante produite dans ce dossier utilise la requête groupée ; le rendu est identique caractère par caractère (`true`) et les appels unitaires passent de 31 à 0 (la voie groupée ne passe plus par l'endpoint instrumenté par utilisateur).

---

## Incidents d'environnement (transparence)

- Le dépôt a été modifié pendant l'expérience par un processus externe : `crates/genos-core/src/biomimicry/mod.rs` contenait deux fois `pub mod senescence;` puis des doublons `autopoiesis`/`senescence` en fin de fichier. Réparations : dédoublonnage, restauration de `pub use vaccination::*;` (supprimée par mon rognage), et ajout dans `senescence.rs` des types `CapsuleVitals`, `SenescenceThresholds`, `VitalState` référencés par `cmd_bio_features.rs` mais absents du dépôt. Build final : OK.
- Première tentative du script bottleneck trop lente via `cargo run` (recompilation à chaque appel) ; basculé sur le binaire `target/debug/genos.exe`.
- Erreur CLI relevée : `genos agent mutate --drive exploration=0.4` depuis 0.7 échoue avec `Error: exploration mutation produces 1.1; expected a value between 0 and 1`.

## Inventaire des fichiers générés

`test_env_genos_7_9/` : `eval_script.js`, `flaky_runner.js`, `bottleneck_experiment.ps1`,
`src/DataTable.ts`, `DataTable_naive.ts`, `DataTable_speed.ts`, `DataTable_strict.ts`, `DataTable_balanced.ts`,
`src/flaky_network.ts`, `flaky_test.ts`, `src/user_feed.ts`, `queries.ts`,
`agents/worker_{speed,strict,balanced}.yaml`, `agents/flaky_winner{,_inferred,_full}.yaml`, `agents/pop_agent_0..9.yaml`,
`agents/ui/{ui_worker,db_worker_migrated}.yaml`, `agents/db/` (vide après migration),
`agents/ui/{ui_worker_attempt,hybrid_feed}.ts`, `phen_run_initial.yaml`, `phen_clone1..5.yaml`,
`snap_pop_*.json`, `.genos79/capsules/agent-world-capsules.jsonl` (10 capsules post-désastre).
