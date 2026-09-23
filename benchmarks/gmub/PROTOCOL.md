# Protocole — première campagne GMUB réelle

Campagne minimale crédible : un modèle de base, une ladder de 3+ modèles,
un domaine, puis extension. Le harness ne mesure rien lui-même : il
agrège des scores **mesurés** dans le runtime.

## Phase 0 — calibration (pas cher, obligatoire)

1. `npm --prefix backend run test:quality` doit passer (11/11).
2. Choisir le domaine initial : **ImpossibleBench**
   (`POST /impossible-bench` : abstention + Brier) — déjà câblé au
   `modelRouter`, seed explicite, juge indépendant si `llm_judge`.
3. Figer dans le gabarit : `suite`, `seed`, `budgets` (tokens, $, temps),
   `genos_commit` (`git rev-parse HEAD`), `model` de base.

## Phase 1 — ladder solo (A)

Pour chaque modèle (même cas, même seed, budgets solo notés) :
- route explicite `provider://model` (`GENOS_DEFAULT_MODEL` ou policy
  agent) ; noter `requestedModel` vs `servedModel`, tokens, coût, latence ;
- 3+ modèles ordonnés du plus petit au frontier
  (ex. local → intermédaire → frontier) ;
- saisir chaque `score` (taux de cas passés, même graders partout).

Les tiers émergent du tri. Ne jamais les fixer à la main.

## Phase 2 — contrôle compute naïf (B)

Même modèle de base, mêmes cas, **sans GenOS** :
`independent_samples` (N=5) + `majority_vote`, puis `retry` borné au
budget. Noter tokens/coût réels : B doit coûter ≈ C pour la comparaison
efficiency-matched, sinon le rapport le signalera (`tokenMultiplier`).

## Phase 3 — GenOS (C) + GCAB

- Lancer chaque cas via `backend/bin/genos-orchestrate.cjs`
  (ou `evaluation_jobs`), topologie fixée (ex. `trinity`) ;
- noter `declared` (contrat `topologyCapabilityService`),
  `activated` (leases `toolLeasePolicy` réellement élargis),
  `observed` (opérations effectivement appelées : sessions, steps
  d'essaim, barrières) ;
- bras `ablation` (`mode: ablation`, champ `ablated`) et bras
  `nonbio` (orchestration classique) sur exploration/recovery/diversité.

## Phase 4 — analyse et publication

```bash
node benchmarks/gmub/new-campaign.cjs --suite gmub-r1 --model <base> --models <m1,m2,m3> --cases <c1,c2,..> --out campaign.json
# ... remplir les scores mesurés ...
node benchmarks/gmub/run-gmub.cjs --input campaign.json --out report.json
```

Publier la carte (template au README) **avec** les `inconclusifs` :
`LCB95 > margin` sinon on écrit « inconclusif », jamais victoire.
Règle d'arrêt : si `abc.fullOrdering` est faux, on ne parle pas de bonus
d'organisation ; si l'attribution GCAB refuse, on ne nomme pas la topologie.

## Garde-fous

- Cas triviaux inclus : GenOS doit y être neutre ou pire (sinon protocole
  biaisé en sa faveur).
- `kind: metric`, `qualityGuarantee: false` : la carte informe, n'autorise rien.
- Toute campagne référence `suite.json` (version du protocole) et le commit.
