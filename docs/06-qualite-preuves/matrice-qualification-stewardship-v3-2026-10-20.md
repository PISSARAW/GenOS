# Matrice de qualification — stewardship V3 — 2026-10-20

- **Statut** : inventaire probant daté
- **Objet** : distinguer inspiration, contrat implémenté, test local et preuve manquante
- **Référence de comparaison** : analyse de marché et de recherche arrêtée au 4 octobre 2026
- **Verdict global** : composants substantiels présents ; boucle intégrée longitudinale non qualifiée

## 1. Méthode

Une capacité reçoit l’un des niveaux suivants :

| Niveau | Signification |
| --- | --- |
| `C0 — concept` | idée documentée, sans contrat exécutable identifié |
| `C1 — contrat` | validation ou politique déterministe implémentée |
| `C2 — persistant` | état durable, lignée ou reprise implémentés |
| `C3 — intégré localement` | plusieurs composants raccordés et testés dans le dépôt |
| `C4 — qualifié` | protocole causal ou adversarial exécuté avec preuves reproductibles |
| `C5 — longitudinal réel` | effet durable observé sur plusieurs fenêtres réelles indépendantes |

Un test unitaire vert peut soutenir `C1` ou `C2`. Il ne suffit pas à `C5`.

## 2. Synthèse

| Axe | Niveau observé | Motif |
| --- | --- | --- |
| responsabilité et consentement | C2 | ledger, révisions, observation minimisée et oubli testés |
| arbitrage agir/observer/apprendre | C1 | politique déterministe, budget et permissions testés |
| délégation asynchrone | C2 | SQLite, lease, fencing et checkpoints testés |
| monde contrefactuel | C2 | plans et observations persistés, promotion interdite |
| modèle du monde | C2 | prédiction préenregistrée, observation et apprentissage persistés |
| évolution de scaffold | C1 | constitution, hypothèses et ledger en mémoire ; pas d’applicateur |
| campagne AIDE² | C1 | protocoles et statistiques déterministes ; pas d’exécution de modèles |
| stewardship spécialisé | C2/C3 | plusieurs domaines avec stores et tests, raccord hétérogène |
| double preuve causale | C2 | résultat atomique de trajectoire et revue causale AIDE² |
| boucle intégrée | C0/C1 | architecture documentée, pas d’orchestrateur unique qualifié |
| effet longitudinal public | absent | aucune campagne réelle publiée dans le dépôt |

## 3. Matrice par famille rivale

La colonne « reprise » indique le mécanisme que GenOS transpose. Elle ne signifie ni
compatibilité, ni équivalence, ni supériorité.

| Famille / référence | Reprise GenOS | Fichiers principaux | Tests | Niveau | Preuve manquante |
| --- | --- | --- | --- | --- | --- |
| agents de coding asynchrones | délégation persistante, capsule, checkpoints | `ontogenesis/asyncDelegation*` | `test_ontogenesis_async_delegation.js` | C2 | campagnes multi-processus et dépôts réels |
| usines logicielles continues | stewardship du dépôt et effet post-intégration | `repositoryStewardship*`, `codingStewardshipService.js` | tests repository/coding | C2 | durée, volume et incidents réels |
| agents généraux persistants | responsabilité ambiante révocable | `ambientAgency/` | trois tests ambient | C2 | scheduler intégré et consentement en production |
| harness planner/generator/evaluator | vérification séparée et jury pluraliste | `studioInterfaceEvolution/` | trois tests interface | C1 | sessions UX réelles et reproductibilité inter-juges |
| agents autotelic / curriculum | sélection multisignal et `NO_CHANGE` | `gvxGoalSelector.js` | `test_gvx_goal_selector.js` | C1 | calibration empirique des poids |
| AIDE² | campagne multi-générations et double causalité | `aide2/` | `npm --prefix backend run test:aide2` | C1 | exécution réelle des générations |
| Darwin Gödel Machine | lignées de scaffold et archive négative | `governedEvolution/` | trois tests governed evolution | C1 | applicateur isolé, benchmark tiers |
| systèmes de self-editing | constitution et rollback | `governedEvolution/constitution.js` | hypothesis/evaluation | C1 | signature durable et promotion intégrée |
| DiCode / niches synthétiques | tâches pédagogiques bornées | composants de campagne et laboratoire | tests liés aux ADR | C1 | générateur complet et mesure de diversité |
| WebEvolver | mondes contrefactuels + observation réelle | `counterfactualWorldEvolutionService.js` | test counterfactual world | C2 | agent web complet et évaluation tierce |
| WorldEvolver | épisodes, règles, prospective sélective | `predictiveTimescale/` | predictive timescales/distribution/bridge | C2 | benchmarks ALFWorld/ScienceWorld équivalents |
| stewardship de site | observations et candidats longitudinaux | `shev/website*` | `test_shev_website_stewardship.js` | C2 | trafic, parcours et effets réels |
| SRE autonome | hypothèses causales, risque, rollback | `sreHealing*Service.js` | policy/store | C2 | incidents rejoués et chaos tests |
| builders produit/site | contrat, jury, acceptation, effet | services Studio product | `test_studio_product_*` | C3 | utilisateurs et mesures statistiques réels |
| agents UX | évaluation pluraliste et désaccord | `studioInterfaceEvolution/` | interface governance/evaluation/evolution | C1 | panel indépendant et validité externe |
| skills réutilisables | manifeste, gate, rétention | `gvxReusableSkill*`, `gvxSkillStewardship.js` | manifest/gate/stewardship | C2 | transferts inter-projets réels |
| organisations multi-agents | essai apparié de topologies | morphogenèse et ADR 0684 | suites morphogenesis/topologies | C3 | benchmark apparié transversal complet |

## 4. Preuves disponibles

### 4.1 Responsabilité ambiante

Les tests couvrent création, amendement, isolation tenant, consentement, minimisation,
révocation, oubli, arbitrage et apprentissage de feedback. Ils soutiennent la présence
d’un ledger local. Ils ne démontrent pas que toutes les sources externes respectent le
consentement.

### 4.2 Trajectoire et double preuve

Les tests falsifient les scores hors bornes, permissions manquantes, budget insuffisant,
absence de lease d’écriture, incohérences de relecture, preuves non indépendantes et
reçus SHEV invalides. Ils soutiennent un gate local atomique, pas l’exactitude du
contenu des preuves.

### 4.3 Délégation

Les scénarios testent plan dérivé, confinement de capsule, lease, expiration, fencing,
ordre des checkpoints, rejeu idempotent, interruption et issues terminales. La
résistance à une panne OS brutale avec processus réels reste à qualifier séparément.

### 4.4 Évolution

Les campagnes synthétiques vérifient séparation des corpus, lignage, intervalles,
reward hacking, rôles indépendants, digests et non-promotion. Elles prouvent le
protocole ; elles ne prouvent pas qu’un modèle ou un agent s’améliore.

### 4.5 Produit et interface

Studio lie contrats, évaluations, acceptation et observations d’effet à des runs locaux.
Les navigateurs et fixtures testent la chaîne technique. Les fixtures ne sont pas des
utilisateurs réels et les tailles d’échantillon ne fondent aucune significativité.

## 5. Invariants transversaux à conserver

| Invariant | Preuve attendue |
| --- | --- |
| succès transport ≠ décision valide | gate métier après exécution |
| simulation ≠ effet réel | classes de preuve séparées |
| action ≠ apprentissage | deux résultats et deux preuves |
| sélection ≠ autorisation | sortie non promotrice |
| autorisation ≠ application | applicateur externe et reçu |
| acceptation ≠ effet | observation post-intégration |
| score ≠ consentement | permission non compensable |
| accès ≠ mandat | responsabilité active et versionnée |
| mémoire ≠ vérité | provenance, contradiction et révocation |
| reprise ≠ duplication | lease + fencing + idempotence |

## 6. Plan de qualification manquant

### Q1 — Composition locale reproductible

Construire une fixture unique reliant responsabilité ambiante, arbitrage, délégation,
vérification, effet et double preuve. Injecter `NO_CHANGE`, interruption et révocation.

**Sortie attendue** : dossier de preuves lié au commit, sans bypass de promotion.

### Q2 — Pannes et concurrence

Tuer le worker entre chaque checkpoint, perdre les réponses après commit, provoquer
deux claims concurrents, expirer un lease et réutiliser un ancien fence.

**Sortie attendue** : aucune double écriture, reprise déterministe, artefacts conservés.

### Q3 — Validité causale

Préenregistrer une responsabilité et un protocole apparié. Mesurer baseline, candidat,
holdout, OOD et plusieurs fenêtres projet. Faire vérifier par des identités distinctes.

**Sortie attendue** : compétence et effet projet soutenus séparément, ou conclusion
inconclusive explicitement conservée.

### Q4 — Généralisation

Transférer une compétence candidate à un contexte non vu, sans partager les données de
sélection. Mesurer bénéfice, régression et rétention.

**Sortie attendue** : promotion externe seulement si les trois axes sont soutenus.

### Q5 — Exploitation longitudinale

Maintenir plusieurs responsabilités réelles sur une durée préenregistrée, avec journal
des réveils, `NO_CHANGE`, coûts, incidents, rollbacks et effets.

**Sortie attendue** : données permettant d’estimer utilité, faux positifs, coût et
stabilité ; pas seulement des anecdotes de succès.

## 7. Critères de passage global

La boucle intégrée ne doit pas être présentée comme qualifiée avant que :

- Q1 et Q2 soient verts sur la même révision ;
- Q3 contienne au moins une réplication indépendante ;
- Q4 montre une rétention et un transfert sans régression excessive ;
- Q5 couvre plusieurs fenêtres et publie aussi les échecs ;
- les preuves soient accessibles et liées aux artefacts exécutés ;
- les limites statistiques et opérationnelles soient documentées.

## 8. Commandes de vérification locale

```powershell
node backend/tests/test_ambient_responsibility_ledger.js
node backend/tests/test_ambient_observation_consent.js
node backend/tests/test_ambient_feedback_arbitration.js
node backend/tests/test_trajectory_stewardship_policy.js
node backend/tests/test_trajectory_stewardship_store.js
node backend/tests/test_trajectory_stewardship_outcome.js
node backend/tests/test_ontogenesis_async_delegation.js
node backend/tests/test_ontogenesis_repository_stewardship.js
node backend/tests/test_counterfactual_world_evolution.js
node backend/tests/test_predictive_timescales.js
node backend/tests/test_predictive_distribution.js
npm --prefix backend run test:aide2
```

Les suites de domaine (Studio, SHEV, SRE et GVX) complètent cette liste. Toute preuve
doit mentionner la révision, l’environnement et les éventuels tests non exécutés.

## 9. Verdict honnête

GenOS V3 possède désormais des briques cohérentes pour réunir responsabilité,
initiative, délégation, évolution, modèle du monde et preuve causale. La densité de
contrats et de refus dépasse un simple document conceptuel. Toutefois, le dépôt ne
contient pas encore la preuve que la chaîne complète fonctionne durablement dans un
projet réel, ni qu’elle surpasse les systèmes qui ont inspiré ses composants.

La formulation correcte est donc : **architecture intégrée, composants testés,
qualification longitudinale à produire**.

## Voir aussi

- [Ontogenèse dirigée par responsabilité](../01-concepts/ontogenese-dirigee-par-responsabilite.md)
- [Évolution contrefactuelle gouvernée](../02-orchestration/evolution-contrefactuelle-gouvernee.md)
- [Contrats de stewardship V3](../03-reference/contrats-stewardship-v3.md)
- [Runbook longitudinal](../04-exploitation/runbook-stewardship-longitudinal.md)
