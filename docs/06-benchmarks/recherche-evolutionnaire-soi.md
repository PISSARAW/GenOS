# Recherche évolutionnaire des mécanismes du soi (P3)

> Benchmark : `crates/genos-orchestrator/src/self_evolution.rs`
> Runner : `cargo run -p genos-orchestrator --example self_evolution_experiment`
> Résultats : `benchmarks/cognitive-key-ablation/results/self-evolution-p3.txt`

## Question expérimentale

Si l'on place des agents sous des contraintes de survie où chaque mécanisme
du soi a un **coût métabolique**, lesquels sont **sélectionnés spontanément** —
et dans quels environnements ?

C'est la généralisation de l'audit conscience : plutôt que de prescrire
l'architecture (GWT, self-model, agency), vérifier que ces mécanismes sont
une **réponse adaptative** que l'évolution retrouve seule.

## Protocole

- **Génotype** : 7 gènes d'activation ∈ [0,1] — self_model, memory,
  interoception, workspace, agency, homeostasis, metacognition.
- **Population B** (évolutable) : 2 îlots × 12 individus, activation
  initiale faible [0, 0.3], 40 générations, sélection par tournoi,
  croisement + mutation gaussienne, bonus de nouveauté, migration.
- **Population A** (prescrite, référence) : toutes strates à 1.0.
- **Fitness = survie** : chaque tick, les strates actives **récoltent** de
  l'énergie selon le profil de bénéfices du milieu et **consomment** leur
  coût métabolique. Mort si énergie ≤ 0. L'agency filtre 80 % du bruit
  environnemental.
- **4 environnements** : Hostile (pannes fréquentes), Predictable
  (feedback fiable), Deceptive (effets bruités), Volatile (phases changeantes).
- 3 seeds par environnement (42, 1337, 2026) — déterministe et reproductible.

## Résultats mesurés (40 générations, moyenne 3 seeds)

| Environnement | Strates sélectionnées (> 0.5) | Strates rejetées (< 0.2) |
| --- | --- | --- |
| Hostile | interoception 1.00, homeostasis 1.00, metacognition 1.00, workspace 0.99, agency 0.98, self_model 0.70 | — |
| Predictable | memory 0.99 | self_model 0.00, workspace 0.00, metacognition 0.00, interoception 0.02, agency 0.10 |
| Deceptive | agency 1.00, workspace 1.00, memory 1.00, self_model 0.99, interoception 0.99, homeostasis 0.99, metacognition 0.99 | — |
| Volatile | les 7 strates ≈ 1.00 | — |

## Lecture

1. **Le soi complet émerge spontanément dans les milieux difficiles.**
   Partis d'activations quasi nulles, les agents d'Hostile/Deceptive/
   Volatile réactivent seuls l'interoception, l'homéostasie, le workspace
   et l'agency — parce que ces mécanismes augmentent la survie.

2. **Le soi est rejeté quand il ne paie pas.** En Predictable, l'évolution
   désactive 5 strates sur 7 et ne garde que la mémoire : quand le
   milieu est fiable et que le feedback est stable, le self-model,
   le workspace et la métacognition coûtent plus qu'ils ne rapportent.
   C'est la démonstration que ces mécanismes sont une **réponse
   adaptative**, pas une nécessité absolue.

3. **La spécialisation suit le profil du milieu** : l'agency domine en
   Deceptive (bruit élevé à filtrer), l'homéostasie domine en Hostile
   (ressources rares), la métacognition et la mémoire dominent en Volatile.

## Limites honnêtes

- **Circularité partielle (assumée et contrôlée).** La fitness est une
  **simulation économique** (récolte/coût), pas une mission réelle : elle
  encode une hypothèse de bénéfice par strate et milieu. Les profils de
  bénéfices sont déclarés dans `benefit_profile`, pas découverts —
  l'évolution retrouve ce qu'on y a mis. Le contrôle par permutation le
  prouve (`benefit_profile_permutation_controls_selection`) : le classement
  agency vs homéostasie S'INVERSE entre Deceptive et Hostile, exactement
  comme la table déclarée le dicte. P3 mesure donc une **direction de
  sélection sous hypothèses**, pas une découverte de mécanismes. La vraie
  preuve exigerait des bénéfices mesurés sur tâches réelles (détection de
  pannes, filtrage de bruit observé) et le couplage aux mécanismes P1/P2.
- **Δ Predictable non interprétable.** En Predictable, « évolution >
  prescrite » (+0.152) est un **artefact de mort métabolique précoce** :
  le prescrit (tout=1.0) meurt au tick ~3 de sur-activation (survie 0/3,
  `prescribed_survived=false` dans le rapport) et reçoit la fitness
  pénalisée ×0.1 ; l'évolué minimal survit. L'évolué évite le suicide du
  prescrit, il ne bat pas un soi complet viable. Le runner l'affiche
  explicitement (`⚠ Δ NON INTERPRÉTABLE`).
- 40 générations × 24 individus n'atteignent pas la fitness de
  l'architecture prescrite (3.5–4.0 vs 42) : l'expérience mesure la
  **direction de sélection**, pas la convergence complète.
- Le couplage avec les vrais mécanismes (ceux de P1/P2) reste à faire :
  les gènes contrôleraient les activations réelles du runtime
  (`recommendActions`, `run_cycle`, `dispatch_broadcast`).

## Reproduction

```bash
cargo test -p genos-orchestrator --lib self_evolution   # 11 tests (dont artefact Predictable + contrôle permutation)
cargo run -p genos-orchestrator --example self_evolution_experiment
```
