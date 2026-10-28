# Analyse de puissance OMEGA-BENCH sur sorties publiques — 2026-10-28

Cette analyse lit uniquement `dataset/oracle/` et les sorties publiques sous `results/`; le holdout n'est ni lu ni modifié.

## Méthode

L'unité indépendante est le scénario. Les trois répétitions sont résumées par leur médiane avant calcul de la variance des différences appariées. Les issues binaires sont résumées par scénario: succès seulement si les trois répétitions sont conformes à l'oracle. Aucun p-value ni résultat confirmatoire n'est produit.

Les effets détectables et tailles requises utilisent une approximation normale bilatérale, puissance 80 %/90 %, et une borne Bonferroni `alpha=0,05/m`. Les familles et `m` retenus sont: D/A = 12, attribution B/A-C/B-D/C = 36, baselines externes = 18, ablations prévues = 8. Le plan confirmatoire proposé devra encore appliquer Holm aux résultats d'une campagne gelée.

## Contrastes principaux D/A

La différence de latence est calculée D moins A en ms; `SD` est l'écart-type des différences appariées par scénario. `MDE80` est l'effet minimum détectable dans ces unités à 80 % de puissance et sous la correction familiale ci-dessus. `discordances C/T` compte les scénarios où seul le contrôle C ou seul le traitement T réussit aux trois répétitions.

| Contraste | n scénarios | Δ latence moyenne (ms) | SD Δ (ms) | MDE80 (ms) | Discordances C/T | n80 pour différence binaire 15 pp |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| D_vs_A_E01 | 200 | 0.925 | 0.152 | 0.040 | 0/0 | 119 |
| D_vs_A_E02 | 200 | 0.876 | 0.135 | 0.035 | 0/0 | 119 |
| D_vs_A_E03 | 1000 | 1.563 | 0.170 | 0.020 | 0/0 | 119 |
| D_vs_A_E04 | 100 | 0.818 | 0.101 | 0.037 | 0/0 | 119 |
| D_vs_A_E05 | 100 | 0.847 | 0.181 | 0.067 | 0/0 | 119 |
| D_vs_A_E06 | 150 | 0.868 | 0.137 | 0.041 | 0/0 | 119 |
| D_vs_A_E07 | 200 | 0.898 | 0.248 | 0.065 | 0/0 | 119 |
| D_vs_A_E08 | 1000 | 0.856 | 0.123 | 0.014 | 0/0 | 119 |
| D_vs_A_E09 | 200 | 0.864 | 0.126 | 0.033 | 0/0 | 119 |
| D_vs_A_E10 | 100 | 282.716 | 75.091 | 27.835 | 0/0 | 119 |
| D_vs_A_E11 | 50 | 1.742 | 0.185 | 0.097 | 0/0 | 119 |
| D_vs_A_E12 | 100 | 0.799 | 0.099 | 0.037 | 0/0 | 119 |

Tous les contrastes D/A ont une couverture complète du scope public et les 10 200 paires scénario-répétition attendues au total. Le JSON associé contient aussi les variances et effets détectables pour latence, octets d'entrée/sortie, tailles `n` pour effets standardisés 0,2/0,5/0,8, et les discordances binaires.

## Ablations exécutées ou approchées

| Ablation/contrôle | n | Éligible comme candidat confirmatoire | Δ latence moyenne (ms) | SD Δ (ms) | MDE80 (ms) | Discordances C/T | n80 pour différence binaire 15 pp |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| A1_optimizer_E04 | 100 | oui | -0.039 | 0.364 | 0.130 | 0/0 | 111 |
| A2_static_verification_E03 | 1000 | non | 0.028 | 0.034 | 0.004 | 0/0 | 111 |
| A3_strong_typing_E03 | 1000 | oui | 1.596 | 0.433 | 0.049 | 0/500 | 282 |
| A4_harness_replay_E05 | 100 | non | 6.020 | 1.570 | 0.562 | 0/0 | 111 |
| A5_morphogenesis_E10 | 100 | oui | 280.167 | 75.082 | 26.849 | 0/0 | 111 |
| A6_physiology_E11 | 50 | oui | -0.281 | 0.717 | 0.363 | 0/0 | 111 |
| A8_typed_JSON_E10_E11 | 150 | oui | -20.650 | 103.888 | 30.333 | 0/0 | 111 |

A7: 200 scénarios; moyenne économisée 180.400 octets/scénario, variance 0.241, médiane de sauvegarde relative 29.292 %. Le round-trip/oracle a 0/0 discordances; n80 à 15 points vaut 111 sous la discordance de planification 0,20. Le MDE continu et le n requis sont disponibles dans le JSON à `alpha=0,05/8`; l'encodage compact et l'enveloppe JSON sont mesurés dans le même adaptateur, pas dans deux processus indépendants.

A2 est un contraste de banc (compilateur contourné contre compile+runtime restant gardé) et A4 est journal/replay au niveau harness; ils sont fournis à titre descriptif et exclus de la preuve confirmatoire comme ablations runtime natives. A5/A6 sont maintenant des contrôles appariés: même enveloppe, compileur, politique et runtime D, seul le handler CALL passe du service GenOS au handler de référence. A8 reste limité à E10/E11 et compare JSON direct aux mêmes services GenOS. Tous ces résultats sont publics et non préenregistrés; les résultats statistiques restent descriptifs.

## Baselines et portée

Les 18 contrastes baseline applicables sont appariés sur leurs scénarios communs déclarés. Ils restent descriptifs: les stacks, les métriques fonctionnelles et les frontières de latence ne sont pas interchangeables. Le calcul inclut toutes les expériences applicables disponibles depuis MLIR, Temporal, LangGraph, A2A, MCP et OPA; A est la référence JSON, déjà couverte par la famille D/A.

Lorsque les données ont zéro discordance binaire, la variance observée ne peut pas estimer la puissance d'un effet non nul. Pour les tableaux `n requis`, le script emploie explicitement l'hypothèse de planification `p(discordance)=0,20`; le JSON indique cette source. Sinon, le taux de discordance observé sur données publiques est utilisé comme hypothèse de planification, sans valeur confirmatoire.

Limites: corpus synthétique public, matériel partagé, adaptateurs non tous équivalents, approximation normale plutôt que test exact, et quelques contrastes limités à une expérience. Cette analyse sert à dimensionner une étude ultérieure; elle ne débloque pas le préenregistrement ni le holdout.
