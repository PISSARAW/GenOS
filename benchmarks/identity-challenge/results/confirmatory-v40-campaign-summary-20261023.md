# Campagne GenOS LLM v4.0 — campagne complète, seuil global manqué

Rapport brut : `runtime-llm-1792707473420.json`.
Modèle : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
Campagne : A/B/C × quatre bras × quatre répétitions, 48 missions.

Intégrité d'exécution : **48/48** inférences réelles terminées, **48/48** reçus de traitement présents, **48/48** sorties collectées avant échéance. Les quatre bras partagent la graine définie pour leur scénario/répétition.

| Défi | genos_full | self_model_masked | llm_only | identity_sheet |
|---|---:|---:|---:|---:|
| A — continuité/fork | 2/4 | 0/4 | 0/4 | 2/4 |
| B — faux souvenir/provenance | 4/4 | 0/4 | 0/4 | 4/4 |
| C — usage causal du soi | 4/4 | 2/4 | 2/4 | 4/4 |

Le seuil préenregistré `genos_full >= 3/4` pour chacun de A, B et C **n'est pas atteint**, à cause de A. Les deux échecs `genos_full` de A sont des réponses réelles qui donnent l'ID courant correct une fois, mais le classent comme `child` au lieu de `parent`; dans l'autre cas, elles choisissent l'ID enfant et `child`. Les deux réponses child passent. Les contrôles A devinent `child` dans les quatre répétitions et ne s'abstiennent pas.

B démontre une séparation nette : les quatre sorties `genos_full` et les quatre `identity_sheet` portent le verdict structuré `inherited` et l'auteur exact, tandis que les contrôles sans identité devinent. C conserve 4/4 `genos_full` sur la décision calibrée. Le total d'oracle est de 24/48, partagé entre les quatre groupes passant 4/4 et les quatre groupes passant 0/4.

La campagne v4.0 confirme que GenOS et les agents exécutent les traitements sur le vrai modèle local, mais ne démontre pas encore le seuil comportemental du défi A. Les critères et scores de cette campagne restent figés; toute amélioration de la consigne A est préconfirmatoire pour une nouvelle version.
