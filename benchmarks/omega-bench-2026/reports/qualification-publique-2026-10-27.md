# OMEGA-BENCH 2026 — qualification publique A/B/C/D

Date d'exécution : 2026-10-27 (Europe/Paris)
Corpus : public v0.4.0, 3 400 cas, 3 répétitions
Révision des adaptateurs : `53374889d1942aea88c8974e1599b5e7170401ad`
SHA-256 du manifeste du corpus : `e8714de000ade8dce84d5cf3f294b23c6f54701293d6fd0f83c76526e90373ab`

## Résultats indépendamment scorés

| Condition | Passages | Corrects | Manquants | Doublons | Statuts invalides | Échecs critiques |
|---|---:|---:|---:|---:|---:|---:|
| A — JSON de référence | 10 200 | 10 200 | 0 | 0 | 0 | 0 |
| B — G-CIR Ω minimal | 10 200 | 10 200 | 0 | 0 | 0 | 0 |
| C — G-CIR Ω optimisé | 10 200 | 10 200 | 0 | 0 | 0 | 0 |
| D — intégration GenOS par tâche | 10 200 | 10 200 | 0 | 0 | 0 | 0 |

E10 et E11 passent tous les contrôles de D : 300 transitions morphogénétiques
authentifiées et committées, avec invariants conservés, et 150 allocations
physiologiques satisfaisant l'oracle indépendant.

## Corrections ayant débloqué l'exécution

- Le handler JSON de référence E11 distribuait les unités avant de satisfaire
  les minima; 96/150 passages E11 échouaient alors dans A/B/C. Il alloue
  maintenant les minima d'abord, puis le reliquat selon la priorité.
- Les plans E10 produits par le vrai planificateur dépassaient parfois la limite
  de ligne de commande Windows. D échouait avec `spawn ENAMETOOLONG`. Le pont
  Node transmet maintenant le JSON signé au CLI Rust par stdin. Le plan complet,
  son empreinte et l'autorité sont conservés.
- Le générateur et le manifeste du corpus déclarent maintenant v0.4.0, ce qui
  versionne le contrat E11 et ses oracles.

## Portée et limites

D utilise les services GenOS réels pour les transitions E10 et les allocations
E11; il réutilise l'exécuteur C pour les dix autres expériences. Aucune
condition ne fait d'appel à un modèle externe. Les mesures ont tourné sur
Windows x64 avec Node v24.18.0 et un AMD EPYC 7543P; d'autres campagnes
tournaient également sur l'hôte. Les latences ne sont donc pas retenues comme
comparaison de performance.

Cette qualification est descriptive et limitée au corpus synthétique public.
Elle n'est pas préenregistrée, ne teste pas de holdout caché et ne démontre ni
généralisation métier ni avantage de G-CIR Ω. Elle ne comprend pas les baselines
externes, les huit ablations, les essais de charge ou l'analyse de puissance.
La campagne confirmatoire reste bloquée jusqu'à résolution de ces conditions,
du verrouillage matériel et des exigences de préenregistrement.

Les JSONL et manifestes sont générés sous `results/`, ignoré par Git. Leurs
empreintes d'adaptateur sont :

- A : `eabe3cc04b1c809e31928f3c97437fdf4b79385a3ab28df2f9cf0c0a31364e69`
- B : `b9b1b9a0fdd75a68e43250d845ac11f46d080f76fd53d55c623101a4b09dc7ef`
- C : `19d10362fe319fbaac13046bcfafdfb538faa3d952ae8521b0966dfa4cffa2b0`
- D : `85f0a0a6ea958e881f1eb8560e4373fc5e4d975de5789e84cdb2050be835c09c`
