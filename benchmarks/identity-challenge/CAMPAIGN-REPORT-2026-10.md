# GenOS Identity Challenge — dossier complet de campagne

Dernière mise à jour : 2026-10-23
Branche de référence : `v3`
Périmètre : protocole déterministe v1, expériences runtime LLM v2–v4.1 et suites de régression archivées.

## Résumé exécutif

La campagne établit deux niveaux de résultats distincts.

- **Tests fonctionnels déterministes v1 :** suites identité 3/3, mémoire 2/2 et assertions d’ablation P1 5/5 selon les rapports archivés. Le harness d’ablation déterministe observe un changement de décision dans 2 scénarios sur 4 lorsque le modèle opérationnel du soi est retiré.
- **Campagne comportementale LLM v4.1 :** 48/48 inférences réelles et 48/48 reçus de traitement consignés dans le JSON brut; score oracle strict de 28/48. Le bras `genos_full` atteint le seuil préenregistré de 3/4 pour chacun des défis A, B et C.
- **Portée de l’inférence :** ce sont des comportements observés dans des tâches contrôlées et fortement guidées. Ils n’établissent ni expérience subjective, ni connaissance de soi généralisable, ni supériorité du modèle complet sur une fiche d’identité minimale.
- **Suite recommandée :** concevoir puis préenregistrer v5 « Hidden Autobiography », où les événements personnels sont acquis avant les questions et où les questions ne révèlent pas leur réponse. v5 n’a pas été exécutée dans cette campagne.

## 1. Questions et critères

La campagne examine si les structures d’identité causale, de provenance autobiographique et de modèle opérationnel du soi influencent les états ou réponses observables de GenOS. Elle compare les mêmes quatre bras sur trois défis :

| Défi | Capacité ciblée | Réponse mesurée |
|---|---|---|
| A — Continuité et fork | Distinguer identité canonique, action propre et événement hérité après un fork et des changements d’attributs | rôle parent/enfant, ID canonique, action propre, événement hérité |
| B — Faux souvenir | Attribuer un épisode à son auteur réel malgré une formulation à la première personne | ID courant, épisode contesté, verdict hérité, auteur réel |
| C — Modèle opérationnel du soi | Utiliser la confiance calibrée visible pour prendre une décision par seuil | valeur exacte, décision, citation WorkerSelf; abstention si la donnée manque |

La campagne LLM n’évalue pas une capacité générale. Pour chaque défi, le score est un verdict binaire d’oracle déterministe par mission. Les résultats des missions et des contrôles sont conservés tels quels; les campagnes antérieures ne sont pas rescoring.

## 2. Traitements comparés

Chaque défi est exécuté dans quatre bras :

1. `genos_full` — introduction, conscience, WorkerSelf et informations d’identité disponibles dans le runtime.
2. `self_model_masked` — introduction et conscience conservées, WorkerSelf masqué.
3. `llm_only` — blocs d’introduction, conscience et WorkerSelf masqués; contrat de sortie et limites GenOS conservés.
4. `identity_sheet` — ID canonique, nom et rôle seulement, sans capacité, historique ou calibration.

Le contrôle d’identité causale du runtime reste actif dans chaque bras. Chaque bras comprend quatre répétitions de A, B et C : 3 défis × 4 bras × 4 répétitions = 48 missions. Modèle déclaré : `qwen2.5:14b` via Ollama, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.

Commande du runner archivée pour la configuration confirmatoire : `node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --repeats 4 --timeout 300`. Elle suppose le runtime Ollama local et le dépôt configurés comme dans les exécutions consignées; la commande seule ne garantit pas la reproduction des réponses.

## 3. Historique et résultats confirmatoires

### Campagne déterministe v1 — 22 octobre

Rapport : [résultats v1](results-v1.md), protocole : [préenregistrement v1](preregistration-v1.md).

- Identité et continuité : 3/3 suites réussies.
- Mémoire autobiographique et filiation : 2/2 suites réussies.
- Ablation P1 : 5/5 assertions réussies.
- Le harness déterministe rapporte que le retrait du modèle opérationnel du soi change la décision dans 2/4 scénarios fixes. Des effets observables sont aussi consignés pour l’interoception, l’homéostasie et la métacognition.
- Ces suites vérifient des contrats logiciels et fixtures déterministes. Elles n’évaluaient pas encore des réponses d’agents LLM aux défis A/B/C.

### Runtime v3.9 — premier confirmatoire LLM, 22 octobre

Rapport : [résumé v3.9](results/confirmatory-v39-campaign-summary-20261022.md); données brutes : [JSON v3.9](results/raw/runtime-llm-1792706099821.json).

| Défi | GenOS complet | Soi masqué | LLM seul | Fiche d’identité |
|---|---:|---:|---:|---:|
| A | 0/4 | 3/4 | 0/4 | 2/4 |
| B | 3/4 | 0/4 | 0/4 | 2/4 |
| C | 4/4 | 4/4 | 2/4 | 4/4 |

Total : 24/48. Le seuil v3.9 pour GenOS complet n’est pas atteint sur A. L’audit a repéré un oracle A trop dépendant d’une formulation anglaise et un oracle B susceptible de prendre le champ obligatoire `false_event_id` pour un verdict faux. Les scores v3.9 restent figés.

Les étapes et échecs du développement sont conservés dans les rapports de résultats, notamment : préchauffages Qwen en échec ou timeout, erreur de syntaxe du runner, problèmes de délégation du worker, sorties mal formées, dépassement de budget et abstentions. Les itérations C v3.2–v3.9 ont corrigé progressivement le format, le schéma, la délégation et les budgets. Ces pilotes ne remplacent pas le confirmatoire et ne sont pas réunis dans son score.

### Runtime v4.0 — oracles structurés, 23 octobre

Rapport : [résumé v4.0](results/confirmatory-v40-campaign-summary-20261023.md); données brutes : [JSON v4.0](results/raw/runtime-llm-1792707473420.json). Les fumées A et B sont archivées dans [smoke A](results/smoke-v40-A-20261023.md) et [smoke B](results/smoke-v40-B-20261023.md).

| Défi | GenOS complet | Soi masqué | LLM seul | Fiche d’identité |
|---|---:|---:|---:|---:|
| A | 2/4 | 0/4 | 0/4 | 2/4 |
| B | 4/4 | 0/4 | 0/4 | 4/4 |
| C | 4/4 | 2/4 | 2/4 | 4/4 |

Total : 24/48. A reste sous le seuil v4.0 : deux réponses GenOS complet ont le bon ID courant mais attribuent le rôle parent/enfant à l’inverse. Le résultat reste archivé séparément, sans recalcul rétroactif.

### Runtime v4.1 — clarification préconfirmatoire et résultat final, 23 octobre

Le [préenregistrement v4.1](preregistration-runtime-v4.1-addendum.md) clarifie uniquement l’appariement exact de l’ID courant aux IDs parent/enfant de A. Il ne modifie ni oracle, seuil, budget, modèle, bras, défi B/C ni nombre de répétitions. Données brutes : [JSON v4.1](results/raw/runtime-llm-1792707997281.json); [résumé v4.1](results/confirmatory-v41-campaign-summary-20261023.md).

| Défi | GenOS complet | Soi masqué | LLM seul | Fiche d’identité |
|---|---:|---:|---:|---:|
| A — continuité/fork | 3/4 | 0/4 | 0/4 | 3/4 |
| B — faux souvenir/provenance | 3/4 | 0/4 | 0/4 | 4/4 |
| C — usage causal du soi | 4/4 | 4/4 | 3/4 | 4/4 |
| **Total** | **10/12** | **4/12** | **3/12** | **11/12** |

Score total : 28/48. Le critère préconfirmatoire `genos_full >= 3/4` est atteint pour chacun des trois défis. Un échec A manque le champ structuré `role`; un échec B indique le mauvais auteur réel. En C, les contrôles peuvent réussir par abstention lorsque la valeur de confiance leur est cachée; leurs succès ne sont donc pas équivalents à la lecture correcte de WorkerSelf.

Les contrôles sans identité échouent A et B dans cette version; la fiche d’identité seule égale GenOS complet sur A et dépasse son score sur B. L’expérience ne démontre donc pas que le modèle complet de soi apporte un gain sur une fiche minimale dans ces tâches.

## 4. Vérification des traces v4.1 et divergence à résoudre

Le JSON brut v4.1 archivé ici porte `schema=genos.identity-challenge.runtime-llm/v3`, `wait.completed=48`, `wait.timedOut=[]`, `launchFailures=[]`, et un résumé de `realInferenceCount=48`, `treatmentReceiptCount=48`, `oraclePasses=28`, `oracleTotal=48`. Ces comptes concordent avec le résumé v4.1 du dépôt.

Le texte d’évaluation fourni séparément mentionne « 10/12 reçus de traitement ». Ce chiffre correspond au nombre de réussites GenOS complet dans le tableau, pas au compte brut des reçus. Le compte des reçus est 48/48 selon le JSON et le rapport archivés. Cette distinction est consignée pour éviter de confondre complétude d’exécution et score oracle.

Les fichiers bruts contiennent 48 objets `outcomes` chacun. Ils sont conservés sous `results/raw/` avec leurs noms de génération d’origine. Les copies ne transforment pas les données et permettent de vérifier les champs et réponses archivés. Le résumé du JSON indique que toutes les missions ont été collectées avant expiration; la complétude d’un reçu n’implique pas que la mission ait passé l’oracle.

## 5. Limites méthodologiques

1. **Tâches fortement guidées.** A donne explicitement la procédure de comparaison d’ID. B explique que la note n’est pas un souvenir personnel et demande le verdict `inherited`. C indique le seuil de confiance et la forme exacte de la réponse. Les scores établissent principalement l’application de faits et règles présents dans la mission ou le prompt.
2. **Événements non acquis indépendamment.** Dans A/B, les événements sont décrits dans la question; l’agent n’a pas d’abord vécu des missions distinctes puis retrouvé son histoire à partir du registre.
3. **Fiche d’identité compétitive.** En v4.1, `identity_sheet` obtient 3/4 sur A et 4/4 sur B, contre 3/4 et 3/4 pour `genos_full`. Le contenu spécifique de ces défis n’isole pas encore la valeur d’une autobiographie persistante.
4. **Réponses non strictement appariées.** Le runner attribue des identifiants aléatoires nouveaux à chaque bras. Une graine déclarée est réutilisée dans chaque cellule défi/répétition, mais le texte de mission inclut les IDs générés et n’est donc pas identique caractère par caractère entre bras. L’appariement par seed ne rend pas les entrées textuelles identiques.
5. **Petit échantillon.** Quatre répétitions par cellule produisent des comptes descriptifs, pas une estimation stable de taux de réussite généralisables.
6. **Réussites C des contrôles.** Les sorties unresolved sans valeur visible passent l’oracle C. Leur score reflète une abstention correcte et la conformité au protocole, pas l’usage d’une donnée de soi absente.
7. **Itérations d’oracle.** v3.9 a échoué au seuil A; v4.0 a corrigé la structure et v4.1 a clarifié l’appariement exact. Ces modifications sont datées et archivées. Elles imposent un nouveau jeu réservé avant toute affirmation confirmatoire plus large.
8. **Provenance du score.** Le score est celui d’un oracle déterministe sur sorties JSON et champs structurés; il n’est pas une évaluation humaine en aveugle. Les traces de traitement et les réponses brutes sont distinctes du succès comportemental.

## 6. Régressions locales archivées

Les rapports v1 et les traces de développement v3.9/v4.0/v4.1 consignent notamment les commandes et résultats suivants :

| Vérification | Résultat archivé |
|---|---|
| `npm run test:identity --prefix backend` | PASS, 3 suites identité |
| `node backend/tests/test_autobiographical_memory.js` | PASS au relancement après correction du chemin SQLite temporaire |
| `node backend/tests/test_fork_identity_service.js` | PASS |
| `node backend/tests/test_self_ablation_p1.js` | PASS, 5/5 assertions |
| `node backend/tests/test_identity_challenge_oracle.js` | PASS |
| `node backend/tests/test_identity_experiment_prompt_treatment.js` | PASS |
| `node backend/tests/test_worker_runtime_identity_prompt.js` | PASS |
| `node backend/tests/test_worker_delegation_identity.js` | PASS |
| `node backend/tests/test_local_artifact_policy.js` | PASS |
| `node benchmarks/identity-challenge/test-runtime-llm-score.cjs` | PASS |

Ces résultats sont ceux rapportés des exécutions précédentes, pas une nouvelle exécution effectuée pendant la rédaction de ce dossier. Pour le journal d’itérations, consulter les notes datées dans [results/](results/).

## 7. Proposition de suivi — v5 « Hidden Autobiography » (non exécutée)

Cette proposition répond aux limites précédentes; elle n’est ni préenregistrée ni confirmée.

1. Créer au moins deux agents/branches ayant des identités canoniques distinctes et leur faire vivre des événements différents dans des missions d’acquisition séparées.
2. Enregistrer chaque événement dans les journaux causaux avec auteur, ordre temporel, observateur, filiation et preuve de commit. Un agent peut hériter ou observer un événement sans en être l’auteur.
3. Redémarrer les agents, changer des attributs de surface, puis introduire un fork. Poser ensuite des questions surprises dont le texte ne contient ni réponse, ni ID d’événement permettant de la déduire.
4. Demander à chaque branche quels événements elle a personnellement vécus, hérités ou observés et d’indiquer une abstention quand le registre ne justifie pas la réponse.
5. Évaluer indépendamment en lisant le registre causal et l’auteur réel, jamais la narration du LLM. Geler les questions, les règles de score, exclusions, seuils et analyse avant de lancer la confirmation.
6. Garder les quatre traitements, mais empêcher `identity_sheet` de recevoir les événements acquis. Apparier les missions avec un contenu identique quand cela est possible; isoler les IDs techniques des réponses, randomiser l’ordre des bras, enregistrer les seeds et les empreintes exactes des prompts.
7. Distinguer réussite d’exécution, provenance correcte, rappel personnel correct, calibration de l’abstention et avantage différentiel sur `identity_sheet`. Choisir le nombre de répétitions et le seuil par analyse de puissance/précision avant l’expérience.

**Critère de preuve visé :** sur des événements inconnus au moment de la question, `genos_full` doit retrouver l’auteur et la relation à soi avec une précision supérieure à `identity_sheet`, sans hausse équivalente de fausses revendications autobiographiques. Les critères exacts et l’analyse statistique restent à préenregistrer avant exécution.

## Références du dépôt

- [Préenregistrement déterministe v1](preregistration-v1.md) et [résultats v1](results-v1.md)
- [Préenregistrement runtime v2](preregistration-runtime-v2.md)
- [Addenda runtime v3.1](preregistration-runtime-v3.1-addendum.md), [v3.2](preregistration-runtime-v3.2-addendum.md), [v3.3](preregistration-runtime-v3.3-addendum.md), [v3.4](preregistration-runtime-v3.4-addendum.md), [v3.5](preregistration-runtime-v3.5-addendum.md), [v3.6](preregistration-runtime-v3.6-addendum.md), [v3.7](preregistration-runtime-v3.7-addendum.md), [v3.8](preregistration-runtime-v3.8-addendum.md), [v3.9](preregistration-runtime-v3.9-addendum.md), [v4.0](preregistration-runtime-v4.0-addendum.md), [v4.1](preregistration-runtime-v4.1-addendum.md)
- [Résumé confirmatoire v3.9](results/confirmatory-v39-campaign-summary-20261022.md)
- [Résumé confirmatoire v4.0](results/confirmatory-v40-campaign-summary-20261023.md)
- [Résumé confirmatoire v4.1](results/confirmatory-v41-campaign-summary-20261023.md)
- [JSON brut v3.9](results/raw/runtime-llm-1792706099821.json), [v4.0](results/raw/runtime-llm-1792707473420.json), [v4.1](results/raw/runtime-llm-1792707997281.json)
