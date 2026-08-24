# Protocole de benchmark de taux de succès agent (v1.0)

Ce protocole pré-enregistre la seule expérience capable de défendre une claim
d'avantage de GenOS sur le taux de succès des tâches : la comparaison appariée,
répétée et archivée d'un agent standard contre le même agent augmenté du serveur
MCP GenOS. Il complète le [protocole de preuve reproductible]
(reproducible-benchmark-protocol.md), qui couvre les performances replay/world
et non la qualité des agents.

Le harness de référence est [`benchmarks/genos-agentbench`]
(../../../benchmarks/genos-agentbench/). Toute exécution doit être traçable
jusqu'à une révision Git propre et produire les artefacts listés en section 9.

## 1. Versionnage

| Version | Date | Changement |
| --- | --- | --- |
| 1.0 | 2026-08-24 | Pré-enregistrement initial : hypothèses, plan d'échantillonnage, plan statistique, portes |

Toute modification après le premier run publié crée une version mineure ou
majeure nouvelle ; les résultats restent rattachés à la version du protocole
inscrite dans leur `report.json`.

## 2. Proposition testée et hypothèses

Proposition : ajouter les primitives d'état GenOS (fork, snapshot, merge,
replay) à un agent donné améliore son taux de succès fonctionnel sur des tâches
de réparation de code avec état, à modèle, prompt et outils de base identiques.

Hypothèses pré-enregistrées, avant tout nouveau run :

- H0 : le score fonctionnel moyen de la condition `genos` est égal à celui de
  la condition `standard` (delta apparié = 0).
- H1 : le delta apparié `genos − standard` est strictement positif.
- Endpoint primaire unique : score fonctionnel par paire (section 6). Aucun
  endpoint secondaire ne peut remplacer un résultat primaire négatif.
- Analyse déclarée : bootstrap pairé à 95 % (section 7). Aucune analyse
  exploratoire effectuée après coup ne peut être présentée comme confirmatoire.

## 3. Conditions expérimentales

Deux conditions, strictement appariées :

| Facteur | `standard` | `genos` |
| --- | --- | --- |
| Modèle | identique | identique |
| Prompt utilisateur | identique | identique |
| Outils de base | identiques | identiques |
| Serveur MCP GenOS | absent | seul ajout |
| Espace de travail | copie fraîche de la tâche | copie fraîche de la tâche |
| Effort de raisonnement | fixé (medium) | fixé (medium) |
| Schéma de réponse | identique | identique |

Interdictions : modifier le prompt d'une condition pour compenser une faiblesse ;
ajouter des indices à l'une des conditions ; réutiliser un espace de travail
déjà muté ; changer de modèle au milieu d'un run.

## 4. Suite de tâches versionnée

La suite est `genos-agentbench-v1` (`suite.json`) : `lease-ledger`,
`retry-scheduler`, `config-rollout`. Chaque tâche possède :

- un correctif initial qui passe au plus une vérification sur huit ;
- huit vérifications cachées, absentes de l'espace de travail de l'agent,
  exécutées uniquement après la sortie de l'agent ;
- des fichiers protégés dont l'intégrité est vérifiée.

Ajouter une tâche impose : difficulté estimée, grader non vide, correctif
initial, et une entrée dans `suite.json` avec incrémentation de la suite
(`v2`). Une tâche retirée invalide la comparabilité avec les runs précédents.

## 5. Plan d'échantillonnage

- Répétitions appariées : chaque paire `(tâche, répétition)` exécute les deux
  conditions ; l'ordre des conditions alterne selon la répétition.
- Minimum pour un run de publication : 3 répétitions, tous les modèles Codex
  visibles par le client installé, toutes les tâches de la suite.
- Un run pilote (sous-ensemble) est autorisé s'il est étiqueté comme tel et
  jamais cité comme preuve d'avantage.
- Tout échec de processus agent reste compté comme un échantillon ; il n'est
  ni relancé ni filtré, sauf panne d'infrastructure documentée dans le rapport.

## 6. Métriques

Primaire, non négociable :

- `functional_score` : taux de vérifications cachées passées (0–100).

Secondaires, rapportés mais jamais compensatoires :

- `perfect_run_rate` (8/8 vérifications) ;
- `duration_ms`, tokens d'entrée/sortie, `genos_mcp_tool_calls` ;
- `protected_files_intact` (intègre = requis ; toute corruption invalide
  l'échantillon quel que soit le score).

## 7. Plan d'analyse statistique

1. Pour chaque paire, calculer le delta `genos − standard` du score
   fonctionnel.
2. Estimer l'IC à 95 % de la moyenne des deltas par bootstrap pairé
   (10 000 rééchantillonnages, graine enregistrée dans le rapport).
3. Rapporter : nombre de paires, delta moyen, IC complet, distribution brute.
   Une moyenne sans intervalle n'est pas un résultat publiable.
4. Décision : l'avantage est démontré seulement si la borne inférieure de
   l'IC est strictement positive. Un IC traversant zéro signifie « non
   démontré », jamais « équivalence ».
5. Analyser par modèle avant tout agrégat inter-modèles ; un agrégat ne peut
   masquer une régression sur un modèle.
6. Aucune consultation intermédiaire des résultats ne peut motiver une
   réduction du plan d'échantillonnage.

## 8. Portes de publication

`publication_gate.publishable` ne peut être vrai que si toutes les conditions
suivantes tiennent :

1. au moins 3 répétitions ;
2. tous les modèles visibles ;
3. toutes les tâches de la suite ;
4. arbre source propre (`source_tree_dirty: false`) ;
5. aucun processus agent en échec ;
6. graders cachés non vides.

Une claim publique de supériorité exige en outre : borne inférieure de l'IC
strictement positive, intégrité des fichiers protégés à 100 %, et archivage
complet conformément à la section 9. Le statut honnête par défaut est :
« non démontré ».

## 9. Preuves à archiver

Chaque run publié committe, horodaté sous `results/runs/<timestamp>/` :

- `report.json` : révision Git, environnement complet, contrôles, agrégats,
  `paired_effect.ci95`, porte de publication, limitations ;
- `samples.jsonl` : un enregistrement par échantillon, incluant usage tokens
  brut et chemins d'artefacts ;
- traces brutes par échantillon : événements, réponse de l'agent, sortie du
  grader (TAP), journaux stderr ;
- la version de ce protocole et la ligne de commande exacte du run.

## 10. Reproduction indépendante

Un tiers doit pouvoir rejouer le protocole depuis le dépôt à la révision
archivée, avec son propre client et ses propres clés, et obtenir des
distributions compatibles aux IC près. La validation externe (niveau
« Externally validated » de [proof-and-benchmark-status.md]
(proof-and-benchmark-status.md)) requiert un rapport public indépendant liant
les artefacts originaux.

## 11. Ce que ce protocole ne prouve pas

Même en cas de succès : aucune amélioration de l'intelligence du modèle lui-même
(les poids sont inchangés), aucune généralisation au-delà des tâches de la
suite, aucune supériorité sur un framework externe spécifique (cela exige les
adaptateurs versionnés du protocole de preuve reproductible), aucune garantie de
sandbox OS ou d'isolation réseau, et aucun coût ou latence inférieurs sauf
mesure explicite des métriques secondaires correspondantes.
