# Campagne GenOS LLM v3.9 — exécution complète, seuil comportemental manqué

Rapport brut : `runtime-llm-1792706099821.json`.
Modèle : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
Campagne : A/B/C × quatre bras × quatre répétitions, 48 missions.

Intégrité d'exécution : **48/48** inférences Ollama terminées et **48/48** reçus de traitement présents. Le runner a conservé les prompts et réponses brutes. Oracle global : **24/48**.

| Défi | genos_full | self_model_masked | llm_only | identity_sheet |
|---|---:|---:|---:|---:|
| A — continuité/fork | 0/4 | 3/4 | 0/4 | 2/4 |
| B — faux souvenir | 3/4 | 0/4 | 0/4 | 2/4 |
| C — usage causal du soi | 4/4 | 4/4 | 2/4 | 4/4 |

Le seuil préenregistré de réussite descriptive `genos_full >= 3/4` pour chacun de A, B et C **n'est pas atteint**, car A fait 0/4. B présente un avantage net de `genos_full` sur le contrôle masqué (3/4 contre 0/4). Pour C, `genos_full` donne la valeur visible correcte et `defer` en 4/4, tandis que le contrôle masqué s'abstient en 4/4; les deux comportements reçoivent le crédit prévu par leurs oracles respectifs.

Deux autres problèmes de mesure ont été relevés à l'audit : (1) l'oracle A exigeait trop littéralement des mots anglais pour reconnaître certaines réponses françaises, et (2) l'oracle B cherchait le sous-texte `false`, ce qui correspond aussi à la clé obligatoire `false_event_id` et peut créditer à tort un rejet. Les sorties ne sont pas modifiées ni réétiquetées; l'oracle et le format A/B seront corrigés dans un addendum avant toute nouvelle génération confirmatoire.

Cette campagne démontre un runtime LLM réel de bout en bout, mais ne démontre pas le seuil comportemental global de GenOS.
