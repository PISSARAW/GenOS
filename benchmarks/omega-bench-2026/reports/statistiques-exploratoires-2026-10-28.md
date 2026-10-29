# Statistiques exploratoires publiques — OMEGA-BENCH 2026

**PROVISOIRE — analyse post hoc, non préenregistrée et non confirmatoire.** Corpus `0.7.0`; hash brut du manifeste: `830dd926a8bb4ecf6749f62bd26165a6efacd263004d95df8499b563bbad4134`. Seuls les résultats dont le manifeste porte cette empreinte peuvent être appariés; les sorties d'une autre version sont ignorées. L'analyse rapporte uniquement les résultats publics effectivement disponibles. Aucun fichier du holdout n'est ouvert ni scoré; aucune conclusion de victoire ou de supériorité n'en découle.

## Méthodes

L'unité est le scénario; les trois répétitions sont résumées par leur médiane. Les différences continues sont calculées à droite moins à gauche. Les IC à 95 % des différences moyennes sont des percentiles bootstrap appariés (2000 rééchantillonnages déterministes par scénario). Les p-values continues viennent du test bilatéral des signes; les succès appariés utilisent McNemar exact bilatéral. Holm est appliqué à toutes les p-values disponibles dans chaque famille et endpoint (primaire, attribution, baselines externes, ablations).

Les analyses de latence, octets et conformité restent des descriptions de ces adaptateurs. Les comparateurs externes n'ont pas tous des implémentations fonctionnellement équivalentes; leurs p-values ne démontrent pas une supériorité technologique. Les coûts monétaires sont N/A: aucune mesure d'énergie attribuable n'existe.

## Comparaisons appariées

Les IC de latence sont en ms; `Δ` vaut droite moins gauche. `McNemar p(Holm)` teste le succès exact à trois répétitions par scénario. `n` compte les scénarios appariés. Un IC dégénéré à [0, 0] avec zéro discordance ne prouve pas l'équivalence; une marge TOST n'a pas été préenregistrée.

| Famille | Comparaison | Portée | n | Δ latence moyenne [IC 95 %] | p(Holm) latence | Discordances gauche/droite | p(Holm) exactitude | Limite |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| primary_D_A | D_vs_A_E01 | E01 | 200 | 1.41 [[1.39, 1.432]] | 1.245e-59 | 0/0 | N/A |  |
| attribution | B_vs_A_E01 | E01 | 200 | 0.04526 [[0.04311, 0.04738]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | C_vs_B_E01 | E01 | 200 | 1.191 [[1.171, 1.211]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | D_vs_C_E01 | E01 | 200 | 0.1736 [[0.1475, 0.2011]] | 4.626e-21 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E02 | E02 | 200 | 1.368 [[1.347, 1.388]] | 1.245e-59 | 0/0 | N/A |  |
| attribution | B_vs_A_E02 | E02 | 200 | 0.05152 [[0.04914, 0.05409]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | C_vs_B_E02 | E02 | 200 | 1.101 [[1.088, 1.114]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | D_vs_C_E02 | E02 | 200 | 0.2156 [[0.1918, 0.2382]] | 4.283e-31 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E03 | E03 | 1000 | 2.451 [[2.435, 2.467]] | 2.24e-300 | 0/0 | N/A |  |
| attribution | B_vs_A_E03 | E03 | 1000 | 1.027 [[1.023, 1.031]] | 6.719e-300 | 0/0 | N/A |  |
| attribution | C_vs_B_E03 | E03 | 1000 | 1.285 [[1.273, 1.299]] | 6.719e-300 | 0/0 | N/A |  |
| attribution | D_vs_C_E03 | E03 | 1000 | 0.1386 [[0.1173, 0.1618]] | 2.707e-17 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E04 | E04 | 100 | 1.563 [[1.53, 1.598]] | 7.889e-30 | 0/0 | N/A |  |
| attribution | B_vs_A_E04 | E04 | 100 | 0.03964 [[0.03816, 0.04114]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | C_vs_B_E04 | E04 | 100 | 1.248 [[1.233, 1.264]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | D_vs_C_E04 | E04 | 100 | 0.2761 [[0.2362, 0.3135]] | 2.454e-19 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E05 | E05 | 100 | 1.277 [[1.251, 1.303]] | 7.889e-30 | 0/0 | N/A |  |
| attribution | B_vs_A_E05 | E05 | 100 | 0.02875 [[0.02778, 0.02986]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | C_vs_B_E05 | E05 | 100 | 1.11 [[1.091, 1.132]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | D_vs_C_E05 | E05 | 100 | 0.138 [[0.1031, 0.1709]] | 1.31e-11 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E06 | E06 | 150 | 1.266 [[1.249, 1.284]] | 8.408e-45 | 0/0 | N/A |  |
| attribution | B_vs_A_E06 | E06 | 150 | 0.0335 [[0.03259, 0.03446]] | 3.363e-44 | 0/0 | N/A |  |
| attribution | C_vs_B_E06 | E06 | 150 | 1.112 [[1.098, 1.127]] | 3.363e-44 | 0/0 | N/A |  |
| attribution | D_vs_C_E06 | E06 | 150 | 0.1198 [[0.09824, 0.143]] | 9.955e-16 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E07 | E07 | 200 | 1.302 [[1.281, 1.325]] | 1.245e-59 | 0/0 | N/A |  |
| attribution | B_vs_A_E07 | E07 | 200 | 0.04562 [[0.0395, 0.05163]] | 7.371e-47 | 0/0 | N/A |  |
| attribution | C_vs_B_E07 | E07 | 200 | 1.115 [[1.103, 1.127]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | D_vs_C_E07 | E07 | 200 | 0.142 [[0.118, 0.1659]] | 2.707e-17 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E08 | E08 | 1000 | 1.279 [[1.271, 1.288]] | 2.24e-300 | 0/0 | N/A |  |
| attribution | B_vs_A_E08 | E08 | 1000 | 0.03126 [[0.03091, 0.03165]] | 6.166e-297 | 0/0 | N/A |  |
| attribution | C_vs_B_E08 | E08 | 1000 | 1.17 [[1.162, 1.179]] | 6.719e-300 | 0/0 | N/A |  |
| attribution | D_vs_C_E08 | E08 | 1000 | 0.07746 [[0.06577, 0.08969]] | 3.313e-29 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E09 | E09 | 200 | 1.334 [[1.31, 1.365]] | 1.245e-59 | 0/0 | N/A |  |
| attribution | B_vs_A_E09 | E09 | 200 | 0.03441 [[0.03317, 0.0357]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | C_vs_B_E09 | E09 | 200 | 1.182 [[1.168, 1.196]] | 3.983e-59 | 0/0 | N/A |  |
| attribution | D_vs_C_E09 | E09 | 200 | 0.1178 [[0.09215, 0.1501]] | 2.518e-12 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E10 | E10 | 100 | 207.6 [[203.3, 212.3]] | 7.889e-30 | 0/0 | N/A |  |
| attribution | B_vs_A_E10 | E10 | 100 | 0.03397 [[0.03295, 0.03511]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | C_vs_B_E10 | E10 | 100 | 1.133 [[1.112, 1.157]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | D_vs_C_E10 | E10 | 100 | 206.5 [[202.3, 211.1]] | 3.313e-29 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E11 | E11 | 50 | 1.515 [[1.484, 1.546]] | 1.776e-15 | 0/0 | N/A |  |
| attribution | B_vs_A_E11 | E11 | 50 | 0.03728 [[0.0353, 0.03979]] | 8.882e-15 | 0/0 | N/A |  |
| attribution | C_vs_B_E11 | E11 | 50 | 1.13 [[1.104, 1.157]] | 8.882e-15 | 0/0 | N/A |  |
| attribution | D_vs_C_E11 | E11 | 50 | 0.3486 [[0.3019, 0.3899]] | 4.533e-12 | 0/0 | N/A |  |
| primary_D_A | D_vs_A_E12 | E12 | 100 | 1.528 [[1.501, 1.555]] | 7.889e-30 | 0/0 | N/A |  |
| attribution | B_vs_A_E12 | E12 | 100 | 0.03857 [[0.03718, 0.04017]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | C_vs_B_E12 | E12 | 100 | 1.127 [[1.107, 1.148]] | 3.313e-29 | 0/0 | N/A |  |
| attribution | D_vs_C_E12 | E12 | 100 | 0.3626 [[0.33, 0.3948]] | 8.766e-26 | 0/0 | N/A |  |
| external_baselines | D_vs_MLIR_E01 | E01 | 200 | -85.46 [[-86.54, -84.41]] | 1.867e-59 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_MLIR_E02 | E02 | 200 | -83.23 [[-84.39, -82.03]] | 1.867e-59 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_MLIR_E03 | E03 | 1000 | -78.39 [[-78.91, -77.86]] | 3.36e-300 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_MLIR_E04 | E04 | 100 | -81.24 [[-82.52, -80.07]] | 1.104e-29 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_MLIR_E12 | E12 | 100 | -81.6 [[-82.97, -80.31]] | 1.104e-29 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_TEMPORAL_E05 | E05 | 100 | -80.54 [[-83.44, -77.76]] | 1.104e-29 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_TEMPORAL_E06 | E06 | 150 | -2864 [[-2869, -2860]] | 1.261e-44 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_TEMPORAL_E07 | E07 | 200 | -676.8 [[-773.9, -581.4]] | 1.867e-59 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_LANGGRAPH_E05 | E05 | 100 | -18.86 [[-19.5, -18.27]] | 1.104e-29 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_LANGGRAPH_E06 | E06 | 150 | -1.457 [[-1.609, -1.325]] | 1.261e-44 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_LANGGRAPH_E07 | E07 | 200 | -1.719 [[-1.877, -1.568]] | 1.867e-59 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_LANGGRAPH_E10 | E10 | 100 | 205.4 [[201, 209.6]] | 1.104e-29 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_A2A_E07 | E07 | 200 | -13.45 [[-13.77, -13.09]] | 2.502e-57 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_A2A_E12 | E12 | 100 | -13.73 [[-13.91, -13.42]] | 1.593e-28 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_MCP_E07 | E07 | 200 | 1.248 [[1.225, 1.27]] | 1.867e-59 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_MCP_E12 | E12 | 100 | 1.465 [[1.436, 1.492]] | 1.104e-29 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_OPA_E03 | E03 | 1000 | -12.92 [[-13.02, -12.81]] | 3.171e-269 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| external_baselines | D_vs_OPA_E08 | E08 | 1000 | -14.1 [[-14.16, -14.04]] | 1.319e-289 | 0/0 | N/A | External baseline adapter has a different stack; descriptive comparator only. |
| ablations | A1_optimizer_E04 | E04 | 100 | 0.3095 [[0.2443, 0.3739]] | 2.626e-14 | 0/0 | N/A |  |
| ablations | A2_static_verification_E03 | E03 | 1000 | 1.143 [[1.135, 1.151]] | 1.12e-300 | 0/250 | 2.211e-75 | Compiler bypass versus compiler+guarded runtime; not an isolated runtime-native static-verification toggle. |
| ablations | A3_strong_typing_E03 | E03 | 1000 | 1.186 [[1.176, 1.196]] | 1.12e-300 | 0/500 | 1.833e-150 |  |
| ablations | A4_harness_replay_E05 | E05 | 100 | 23.31 [[22.87, 23.8]] | 6.311e-30 | 0/0 | N/A | Harness-level journal/fsync/reexecute control; not native G-CIR journaling/replay. |
| ablations | A5_morphogenesis_E10 | E10 | 100 | 206.3 [[202.3, 210.9]] | 6.311e-30 | 0/0 | N/A | Same D envelope/compiler/policy/runtime; only CALL handler changes. Public development scope E10. |
| ablations | A6_physiology_E11 | E11 | 50 | 0.1901 [[0.1528, 0.2238]] | 4.21e-09 | 0/0 | N/A | Same D envelope/compiler/policy/runtime; only CALL handler changes. Public development scope E11. |
| ablations | A8_typed_JSON_all_experiments | E01,E02,E03,E04,E05,E06,E07,E08,E09,E10,E11,E12 | 3400 | 2.827 [[2.55, 3.127]] | 0 | 0/0 | N/A | Full public scope uses D's task service map; real GenOS services are present only on E10/E11, while other workloads use the same deterministic reference handlers. |
| ablations | A7_compact_bytes_vs_JSON_E02 | E02 | 200 | N/A [N/A] | N/A | 0/0 | 1 | Embedded size measures from one adapter; no independent runtime timing arm. |

## Événements rares observés

Le tableau porte sur les scénarios ayant au moins un statut non terminé ou une entrée `violations` non vide dans les trois répétitions. Il ne représente pas l'ensemble des risques de sécurité ou des effets irréversibles. La borne est l'intervalle exact binomial unilatéral à 95 % lorsque zéro événement est observé.

| Condition | Scénarios | Scénarios avec événement | Borne supérieure exacte 95 % si zéro |
| --- | ---: | ---: | ---: |
| A | 3400 | 0 | 1.509e-05 |
| B | 3400 | 0 | 1.509e-05 |
| C | 3400 | 0 | 1.509e-05 |
| D | 3400 | 0 | 1.509e-05 |
| MLIR | 1600 | 0 | 3.206e-05 |
| TEMPORAL | 450 | 0 | 0.000114 |
| LANGGRAPH | 550 | 0 | 9.326e-05 |
| A2A | 300 | 0 | 0.000171 |
| MCP | 300 | 0 | 0.000171 |
| OPA | 2000 | 0 | 2.565e-05 |
| A8 | 3400 | 0 | 1.509e-05 |

## Portées non comparables ou non estimables

- `A2` compare validation+compilation+runtime à runtime gardé et utilise un handler sans effet; cela n'est pas une ablation isolée ni un essai d'action dangereuse.
- `A4` journal/replay se situe au niveau du banc, pas dans le runtime G-CIR natif.
- `A5/A6` changent le handler `CALL`; A5 ne mesure pas une transition persistée et A6 ne mesure pas les euros.
- `A7` compare tailles intégrées dans un seul adaptateur; ce n'est pas un bras de latence indépendant.
- `A8` utilise les mêmes services que D, mais les services GenOS réels ne sont présents qu'en E10/E11; ailleurs les deux côtés utilisent les handlers de référence.
- E09 est un seul processus Node d'invocations asynchrones; aucune borne mémoire de production ou charge de processus système n'est estimée.
- Aucune analyse n'établit trois backends métier indépendants pour E12; A2A/MCP transportent le handler de référence.
- Les coûts API et euros sont N/A; il n'y a pas de données indépendantes permettant un test de coût.
- E04 exerce les cinq passes dans A1-on, chacune sur 20 scénarios (60 exécutions sur 300); l'effet individuel n'est pas isolé et le seuil d'économie de 15 % n'est pas établi.
- Un p ajusté inférieur à 0,05 dans cette analyse post hoc ne remplace pas le préenregistrement, les métriques primaires fixées, les marges d'équivalence ou le score indépendant caché.

