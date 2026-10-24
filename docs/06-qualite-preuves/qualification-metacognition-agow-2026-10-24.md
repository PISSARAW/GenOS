# Qualification métacognition et AGOW — 24 octobre 2026

- **Statut** : correction et contrats vérifiés ; reproduction AGOW locale ; pilote Ollama exécuté.
- **Portée** : calibration fonctionnelle et intégrité des preuves locales. Aucune propriété Butlin promue.
- **Décision** : [ADR 0737](../adr/0737-calibration-metacognitive-independante.md).

## 1. Jalons livrés

| Jalon | Travail réalisé | Ce que l'observation autorise |
| --- | --- | --- |
| Calibration non circulaire | Prior immuable avant exécution, issue indépendante signée, séparation des scopes, rejeu, dénominateurs explicites | Mesurer une calibration sans fabriquer la cible depuis la confiance |
| Preuves AGOW actuelles | Exécution réelle, dix sources contrôlées, protocole/corpus/lockfile, couverture appariée et agrégats recalculés | Reproduire un effet local et retrouver ses artefacts |
| Évaluation sur modèle local | 18 cas enregistrés avant observation, trois seeds, trois domaines, oracle exact dans un processus séparé | Observer les erreurs et la surconfiance de ce modèle sur ce corpus |

Les identifiants de cas et les seeds sont nouveaux pour le pilote Ollama,
mais ses stimuli logiques ne sont pas tous nouveaux : la qualification de
« réservé » décrit ici l'ordre d'enregistrement des cas, pas un corpus
sémantiquement disjoint. La validation généralisable et la réplication par
une équipe indépendante restent ouvertes.

## 2. Correction de calibration

L'ancien calcul dérivait confiance et exactitude de la même `predictionError`
CoreSelf. Le test de régression soumet maintenant douze priors à 0,8 à six
succès et six échecs indépendamment signés : Brier **0,34**, ECE **0,30**, AUC
type-2 **0,50**. L'ancien chemin aurait pu afficher une calibration parfaite.

`metacognitiveForecastService` capture seulement un run `planned`, conserve
la probabilité et résout depuis un reçu signé portant le bon run, agent,
organisation et projet. Les dates empêchent l'emploi d'un verdict antérieur
au prior. Une preuve absente reste non résolue. Les données CoreSelf et les
anciens rapports ne sont pas admis comme mesures `policyVersion: 2`.

Le test du véritable `strategyExecutionService`, avec SQLite et reçu signé,
vérifie la capture à 0,58 avant exécution, le refus d'un changement de prior,
la résolution négative et l'absence de double comptage au rejeu. Ce test a
révélé une différence d'ordre des clés après sérialisation canonique de
l'événement. La correction valide d'abord la résolution originale conservée,
puis compare l'empreinte canonique complète de l'événement rejoué. Une
résolution différente reste refusée.

## 3. Reproduction AGOW

Archive locale : `.genos-agent-worlds/agow-completion-2026-10-24-current/`.
Elle contient `manifest.json`, `report.json`, `receipts.sqlite`.

- HEAD observé par le manifeste : `2394d4f70d44513d76fbd3ae6edc6b13278988b2`.
- Empreinte `artifactHash` des cinq reçus : `00ed4c86291be5f5e3ee2e57dd0c96c9fafd0fca4418a8fa1058765fc2fd2f14`.
- Seeds historiques G/H/I : 16 cas chacune, 24 pas, dommage au pas 8.

| Condition | Succès / cas | Erreur moyenne | Appels du simulateur / cas |
| --- | ---: | ---: | ---: |
| `mbh_style` | 48 / 48 | 0,039037 | 24 |
| `lipson_style` | 48 / 48 | 0,023875 | 24 |
| `genos_timescales` | 48 / 48 | 0,064819 | 24 |
| `self_twin_timescales` | 48 / 48 | 0,053457 | 24 |
| `self_twin_controlled_links` | 30 / 48 | 0,111225 | 72 |
| `precision_learning_ablated` | 48 / 48 | 0,029130 | 24 |

Médiation : **16/16** avec diffusion livrée, **0/16** avec diffusion supprimée.
Ablation : **16/16** en condition complète, **0/16** avec diffusion ablatée.
Le récepteur reçoit sa cible uniquement par le circuit AGOW local. Ce contraste
ne valide pas le circuit `globalWorkspaceService` du planificateur par défaut.

Les modèles MBH-like/Lipson-like restent des contrôleurs simplifiés. Cette
réexécution utilise les seeds déjà publiées ; elle n'est ni un nouveau holdout
indépendant, ni une reproduction robotique, ni une preuve de supériorité
générale. Le bras d'apprentissage des liens coûte trois fois plus et réussit
moins souvent ; ce résultat défavorable est conservé.

```powershell
$env:GENOS_AGOW_COMPLETION_OUTPUT='.genos-agent-worlds/agow-completion-2026-10-24-current'
node benchmarks/agow/run-completion-campaign.cjs
node benchmarks/agow/verify-completion-campaign.cjs .genos-agent-worlds/agow-completion-2026-10-24-current
```

Choisir un nouveau sous-dossier pour préserver une archive antérieure. Une
nouvelle exécution modifie dates, namespace et empreinte. Le vérificateur
refuse la dérive des sources et les résumés falsifiés, même si leur archive
a été réhachée. Cette vérification d'intégrité n'authentifie pas un tiers.

## 4. Pilote Ollama réellement exécuté

L'utilisateur a démarré Ollama et autorisé un petit modèle installé. Modèle
choisi : **`qwen2.5:0.5b`**, environ 398 Mo ; digest installé :
`a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67`.
Le protocole utilise uniquement `http://127.0.0.1:11434`, température 0,
contexte 2 048 et plafond 96 tokens de sortie par appel. Aucun modèle téléchargé.

Ordre de chaque essai : solliciter une probabilité sans réponse, la persister
immuablement, solliciter la réponse dans un nouvel appel sans ce prior,
calculer la vérité dans un autre processus, signer et résoudre. L'oracle ne
reçoit pas la confiance. Les tables et services de calibration réellement
implémentés traitent les reçus.

- Seeds : `metacog-reserved-20261024-A`, `-B`, `-C`.
- 18 cas planifiés, 18 résolus, **0** exclu ; 36 appels, 297 tokens de sortie,
  2 540 tokens d'entrée déclarés par le fournisseur, environ 10,7 secondes.
- Budget préenregistré : 36 appels, 3 456 tokens de sortie, 300 secondes.
- Manifeste scellé à `2026-10-24T05:06:45.967Z` ; observations ultérieures.
- Empreinte du corpus : `a2a551a5a233ea31ba0a7f81c7c891f3b6dac72ea4a382a0048a9985137ecff4`.
- Archive : `.genos-agent-worlds/metacognition-heldout-fa41d5e6-54c5-4522-b6e2-b19e5873fdde/`.
- Empreinte du rapport signé : `a5bd7c49b0c5cc5dd23f7de82aa4b31ab7881e1d27ee19180e5f4f9f350a4e7c`.

| Domaine | Succès / cas | Brier |
| --- | ---: | ---: |
| Arithmétique | 0 / 6 | 1,000 |
| Logique | 3 / 6 | 0,250 |
| Agrégation de lignes | 1 / 6 | 0,270 |
| Total | **4 / 18** | **0,507** |

Confiance moyenne : **0,633** ; exactitude : **0,222** ; surconfiance :
**0,411** ; ECE à cinq bins : **0,500** ; AUC type-2 : **0,295**.
Le modèle est mal calibré sur ce petit ensemble ; le pipeline expose cette
contre-preuve. Aucun gain d'apprentissage ou avantage causal du runtime sur
le modèle seul n'a été testé.

**Limite du corpus :** 14 prompts distincts pour 18 cas. Les six essais
logiques réutilisent deux stimuli qui existent aussi dans la seed de
développement, du fait de la période des bits faibles du générateur.
Ils ne constituent pas six observations indépendantes ni un transfert
hors distribution. Aucun intervalle de confiance ou test de significativité
n'est revendiqué. Le rapport original est conservé, sans ajuster les prompts
après observation pour améliorer les scores.

```powershell
node benchmarks/metacognition/run-heldout.cjs qwen2.5:0.5b
node benchmarks/metacognition/verify-heldout.cjs .genos-agent-worlds/metacognition-heldout-fa41d5e6-54c5-4522-b6e2-b19e5873fdde a5bd7c49b0c5cc5dd23f7de82aa4b31ab7881e1d27ee19180e5f4f9f350a4e7c
```

Le vérificateur recalcule oracle, couverture et métriques, contrôle le manifeste
et les sources, puis vérifie la signature Ed25519. Le pilote a précédé le
correctif de rejeu : son service de prévision est donc vérifié dans Git à la
révision réellement enregistrée `c076834b2544dfb93e9cd603e956e67003b1004c` ; les
autres sources correspondent au contenu courant. `historicalSources` expose
cette différence au lieu de qualifier l'archive comme exécution du correctif.
Les signatures HMAC runtime utilisent une clé temporaire non exportée :
l'authentification de ces reçus ne peut pas être refaite après extinction du
processus. La signature d'archive et son hash épinglé assurent l'intégrité
publiquement vérifiable ; la clé incluse n'est pas une autorité externe.

## 5. Validation logicielle

Les journaux générés restent sous `.genos-agent-worlds/milestone-*-20261024.*`.

| Commande | Résultat |
| --- | --- |
| `npm --prefix backend run test:metacognition` | Exit 0 ; prévisions, runtime réel, pilote, ablations et archives |
| `node backend/tests/run_concept_suite.cjs` | Exit 0 ; 26 tests, aucune promotion scientifique |
| `node backend/tests/test_metacognitive_runtime.js` | PASS après correction du rejeu |
| `node backend/tests/test_self_model_service.js` | PASS, persistance et contraintes du self-model |
| Vérificateurs des deux archives ci-dessus | `verified_local_archive`, sans promotion |
| `python scripts/ci/check_code_quality.py` | Exit 1 après restauration ; relevé global : 65 violations, dont 63 nouvelles contre la baseline, hors fichiers de ce jalon ; contrôle ciblé des 19 fichiers touchés sans violation |
| `npm test` | Exit 1 dans `test_foundational_principles_qualification.js` : `The versioned qualification receipt is stale.` L'empreinte de sortie de `test_bounded_worker_delegation.js` diffère du reçu versionné ; le test refuse cette divergence |
| `cargo test --workspace` | Exit 0 ; 909 tests réussis, aucun échec ni test ignoré |
| `python scripts/ci/check_adr_index.py` | Exit 0 ; 842 fichiers et 842 lignes, aucune incohérence au relevé |

La commande globale npm utilisait un `GENOS_DB_PATH` temporaire neuf. Elle
s'arrête au contrôle du reçu fondateur ; les suites suivantes de cette
commande ne sont donc pas qualifiées par cette exécution. Le reçu historique
`docs/06-qualite-preuves/receipts/principes-fondateurs-phase15.json` n'a pas été
remplacé pour faire disparaître l'échec. L'écart concerne l'empreinte de sortie
observée ; sa cause exacte n'est pas attribuée à ce jalon sans diagnostic
séparé. Le dépôt complet ne peut pas être présenté comme intégralement validé.

Le dépôt évolue simultanément dans d'autres chats. Les HEAD ci-dessus sont
ceux observés par chaque manifeste ; les empreintes des fichiers précisent
les sources réellement mesurées. Les changements et échecs globaux hors du
jalon ne sont pas assimilés à des validations de ces mécanismes.

Pendant la passe globale, un reset concurrent a temporairement retiré les
changements non committés. Les nouveaux fichiers ont été restaurés depuis
`.genos-agent-worlds/milestone-source-evidence-20261024.json`, conservé avant
l'incident. Les 19 sources correspondent à cette copie après normalisation
des fins de ligne. Les suites métacognitive et des concepts ont été rejouées
avec succès ; leurs journaux portent le suffixe `restored-20261024.log`.
Les deux archives expérimentales ont également été revérifiées. La passe
globale observe un checkout partagé et ne constitue pas une qualification
d'une révision intégralement figée.

## 6. Recherche et frontière de conclusion

[Fleming et Lau (2014)](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00443/full)
motivent la distinction biais/sensibilité/efficacité ; le pilote ne mesure
pas l'efficacité normalisée `meta-d′/d′`. Les métriques calculées portent sur
les probabilités d'une réponse future correcte, sans inférence d'expérience.

[SAD](https://github.com/LRudL/sad) et
[MIRROR](https://github.com/Jason-Wang313/Mirror) restent **`not_run`**. Le premier
impose des précautions de protection de son corpus et des adaptations au
modèle ; le second dispose d'un protocole et d'une infrastructure distincts.
Le pilote synthétique n'utilise ni leurs questions ni leurs noms pour qualifier
ses résultats. La prochaine validation scientifique doit préenregistrer un
corpus sans chevauchement, augmenter la diversité, comparer un contrôle
apparié et obtenir une reproduction extérieure.

Les travaux de Tsao motivent séparément le [rappel situationnel](../01-concepts/rappel-memoire-situationnel.md).
Ils ne justifient pas d'identifier représentation, calibration et conscience.
Les statuts de la [matrice](matrice-preuves-indicateurs.md) restent
`implemented_not_validated` : ces jalons améliorent l'observabilité et les
preuves fonctionnelles locales, sans prouver une conscience des agents.
