# OMEGA-BENCH 2026 — qualification publique A/B/C/D

Date d'exécution : 2026-10-28 (Europe/Paris), relance après commit
Corpus : public v0.4.0, 3 400 cas, 3 répétitions
Révision des adaptateurs : `577d034974da15931d7d47880255a54981d6b037`
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
Un holdout distinct de 680 cas (20 % par expérience) a été généré ensuite avec
une graine privée stockée hors dépôt. Son manifeste et ses hashes sont vérifiés;
il n'a pas encore été scoré et n'a pas servi à adapter les runners. La campagne
confirmatoire reste bloquée jusqu'à exécution du holdout, résolution des baselines,
du verrouillage matériel et des exigences de préenregistrement.

Les JSONL et manifestes sont générés sous `results/`, ignoré par Git. Les
empreintes d'adaptateur du dernier run sont :

- A : `4cedc417d3a4335f255bb16bb61d95eff4339cd530666784fcf3579e0689da21`
- B : `c4de2cbd7bdd884d3677ef936b1d39733756d63ea2edf7dce215315d6008e72f`
- C : `107ac15d57ac4b83e582a6e6380961bc10bdb6c6aa563de31d0af6c0f40b559b`
- D : `50f4e1ed003fcc0928f8111b2607ee6231f4417b44d72786760816725e5dc45c`
