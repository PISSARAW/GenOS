# Analyse de puissance OMEGA-BENCH sur sorties publiques — 2026-10-28

Cette analyse lit uniquement `dataset/oracle/` et les sorties publiques sous `results/`; le holdout n'est ni lu ni modifié.

## Méthode

L'unité indépendante est le scénario. Les trois répétitions sont résumées par leur médiane avant calcul de la variance des différences appariées. Les issues binaires sont résumées par scénario: succès seulement si les trois répétitions sont conformes à l'oracle. Aucun p-value ni résultat confirmatoire n'est produit.

Les effets détectables et tailles requises utilisent une approximation normale bilatérale, puissance 80 %/90 %, et une borne Bonferroni `alpha=0,05/m`. Les familles et `m` retenus sont: D/A = 12, attribution B/A-C/B-D/C = 36, baselines externes = 18, ablations prévues = 8. Le plan confirmatoire proposé devra encore appliquer Holm aux résultats d'une campagne gelée.

**Audit des chronométrages : A–D mesurent maintenant la même frontière** (objet scénario déjà décodé → réponse sémantique, événements de trace exclus), et les sorties actuelles ont toutes été produites sur la révision `bcb093fefbb5cb7a43be7b68f4347bf5f2d93c6c`. Ces latences restent descriptives : les runs ont eu lieu sur une VM partagée, sans isolation confirmatoire ni plan statistique préenregistré. Elles ne prouvent aucun avantage de performance.

## Contrastes principaux D/A

La différence de latence est calculée D moins A en ms; `SD` est l'écart-type des différences appariées par scénario. `MDE80` est l'effet minimum détectable dans ces unités à 80 % de puissance et sous la correction familiale ci-dessus. `discordances C/T` compte les scénarios où seul le contrôle C ou seul le traitement T réussit aux trois répétitions.

| Contraste | n scénarios | Δ latence moyenne (ms) | SD Δ (ms) | MDE80 (ms) | Discordances C/T | n80 pour différence binaire 15 pp |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| D_vs_A_E01 | 200 | 1.411 | 0.190 | 0.050 | 0/0 | 119 |
| D_vs_A_E02 | 200 | 1.375 | 0.228 | 0.060 | 0/0 | 119 |
| D_vs_A_E03 | 1000 | 2.363 | 0.268 | 0.031 | 0/0 | 119 |
| D_vs_A_E04 | 100 | 1.307 | 0.107 | 0.040 | 0/0 | 119 |
| D_vs_A_E05 | 100 | 1.191 | 0.119 | 0.044 | 0/0 | 119 |
| D_vs_A_E06 | 150 | 1.188 | 0.154 | 0.047 | 0/0 | 119 |
| D_vs_A_E07 | 200 | 1.245 | 0.157 | 0.041 | 0/0 | 119 |
| D_vs_A_E08 | 1000 | 1.239 | 0.168 | 0.020 | 0/0 | 119 |
| D_vs_A_E09 | 200 | 1.248 | 0.137 | 0.036 | 0/0 | 119 |
| D_vs_A_E10 | 100 | 190.734 | 22.941 | 8.504 | 0/0 | 119 |
| D_vs_A_E11 | 50 | 1.566 | 0.156 | 0.082 | 0/0 | 119 |
| D_vs_A_E12 | 100 | 1.482 | 0.143 | 0.053 | 0/0 | 119 |

Tous les contrastes D/A ont une couverture complète du scope public et les 10 200 paires scénario-répétition attendues au total. Le JSON associé contient aussi les variances et effets détectables pour latence, octets d'entrée/sortie, tailles `n` pour effets standardisés 0,2/0,5/0,8, et les discordances binaires.

## Ablations exécutées ou approchées

| Ablation/contrôle | n | Éligible comme candidat confirmatoire | Δ latence moyenne (ms) | SD Δ (ms) | MDE80 (ms) | Discordances C/T | n80 pour différence binaire 15 pp |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| A1_optimizer_E04 | 100 | oui | 0.309 | 0.340 | 0.121 | 0/0 | 111 |
| A2_static_verification_E03 | 1000 | non | 1.143 | 0.127 | 0.014 | 0/250 | 140 |
| A3_strong_typing_E03 | 1000 | oui | 1.186 | 0.161 | 0.018 | 0/500 | 282 |
| A4_harness_replay_E05 | 100 | non | 23.310 | 2.397 | 0.857 | 0/0 | 111 |
| A5_morphogenesis_E10 | 100 | oui | 189.425 | 22.931 | 8.200 | 0/0 | 111 |
| A6_physiology_E11 | 50 | oui | 0.242 | 0.186 | 0.094 | 0/0 | 111 |
| A8_typed_JSON_all_experiments | 3400 | oui | 2.271 | 6.558 | 0.402 | 0/0 | 111 |

A7: 200 scénarios; moyenne économisée 180.000 octets/scénario, variance 0.000, médiane de sauvegarde relative 16.745 %. Le round-trip/oracle a 0/0 discordances; n80 à 15 points vaut 111 sous la discordance de planification 0,20. Le MDE continu et le n requis sont disponibles dans le JSON à `alpha=0,05/8`; l'encodage compact et l'enveloppe JSON sont mesurés dans le même adaptateur, pas dans deux processus indépendants.

A2 est un contraste de banc (compilateur contourné contre compile+runtime restant gardé) et A4 est journal/replay au niveau harness; ils sont fournis à titre descriptif et exclus de la preuve confirmatoire comme ablations runtime natives. A5/A6 sont maintenant des contrôles appariés: même enveloppe, compileur, politique et runtime D, seul le handler CALL passe du service GenOS au handler de référence. A8 couvre les douze expériences publiques en JSON direct avec la même carte de services que D; les services GenOS réels ne sont utilisés que pour E10/E11, et les autres expériences gardent les handlers de référence. L'attribution GenOS reste donc limitée à E10/E11. Tous ces résultats sont publics et non préenregistrés; les résultats statistiques restent descriptifs.

## Baselines et portée

Les 18 contrastes baseline applicables sont appariés sur leurs scénarios communs déclarés. Ils restent descriptifs: les stacks, les métriques fonctionnelles et les frontières de latence ne sont pas interchangeables. Le calcul inclut toutes les expériences applicables disponibles depuis MLIR, Temporal, LangGraph, A2A, MCP et OPA; A est la référence JSON, déjà couverte par la famille D/A.

Lorsque les données ont zéro discordance binaire, la variance observée ne peut pas estimer la puissance d'un effet non nul. Pour les tableaux `n requis`, le script emploie explicitement l'hypothèse de planification `p(discordance)=0,20`; le JSON indique cette source. Sinon, le taux de discordance observé sur données publiques est utilisé comme hypothèse de planification, sans valeur confirmatoire.

Limites: corpus synthétique public, matériel partagé, adaptateurs non tous équivalents, approximation normale plutôt que test exact, et quelques contrastes limités à une expérience. Cette analyse sert à dimensionner une étude ultérieure; ses latences restent descriptives et elle ne débloque pas le préenregistrement ni le holdout.
