# ADR 0536 — Générer et classer un portefeuille morphogénétique borné

- **Statut** : accepté ; portefeuille consultatif implémenté, activation différée
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, décision
- **Lié à** : ADR 0101, 0288, 0430, 0522, 0534

## Contexte

Le catalogue expose plusieurs topologies et leurs variants. Le planificateur actuel
peut compiler des candidats par topologie dans certains modes, résout des profils de
variants et représente les compositions par expressions et graphes. La grammaire
connaît notamment `NEST`, `PARALLEL`, `SEQUENCE`, `COMPETE`, `GATE`, `WRAP`,
`BRIDGE` et `FEDERATE`. Ces éléments valident des propriétés structurelles et
permettent certains chemins de composition. Ils ne forment pas encore un générateur
qui explore les combinaisons topologie-variant imbriquées, vérifie leur compatibilité
sémantique et les classe par résultats observés.

Le compilateur consultatif en cinq phases pour une topologie déjà sélectionnée reste
disponible. Un portefeuille consultatif borné a été ajouté : il énumère les topologies,
variants connus et compositions `NEST`, puis expose les exclusions, les scores
heuristiques, le front de Pareto et la décision d’abstention. Il ne compare pas encore
les résultats d’exécutions. Les relations de topologie peuvent être conceptuelles ou
non spécifiées ; les maturités de variants sont hétérogènes. Le passage syntaxique
d’un graphe ne suffit donc pas à l’admettre pour exécution.

## Décision

Livrer un **générateur borné de portefeuille consultatif**. La première version produit
`NO_CHANGE`, les topologies et variants du registre, ainsi que des expressions `NEST`
à deux feuilles ; elle ne couvre pas toute la grammaire. Elle applique les filtres
disponibles, conserve les exclusions et fournit un classement Pareto explicable. Les
recettes imbriquées restent des propositions, jamais une autorisation d’exécution.

Plafond implémenté : 10 recettes par défaut, configurable jusqu’à 32, et 128 paires
de compositions examinées. La profondeur est actuellement limitée à un niveau de
`NEST` (deux feuilles). La génération rend visibles les candidats retenus, certains
exclus, les raisons et les inconnues ; elle ne fournit pas encore un journal complet
des candidats écartés ni les sources de chaque contrat.

Appliquer d’abord les contraintes dures : capacité, maturité, compatibilité des
variants, relations/adaptateurs, structure, indépendance, fan-out, budget, lease,
autorité et restauration. Les variantes conceptuelles et relations non spécifiées
peuvent alimenter une hypothèse de recherche isolée, jamais devenir une recette
opérationnelle par défaut.

Évaluer séparément qualité vérifiée, coût complet, latence, robustesse, réversibilité
et indépendance de preuve. Conserver les estimations, mesures, provenance et
incertitudes distinctes. Calculer un front de Pareto avant tout arbitrage. N’utiliser
un départage scalaire que si la mission déclare explicitement une priorité ; sinon,
s’abstenir parmi les candidats non dominés, en cas d’incertitude non calibrée ou
lorsque les preuves et ressources sont insuffisantes. Le reçu inclut le motif et les
observations qui pourraient lever l’abstention. Les candidats jamais exécutés restent
inconnus ; un oracle indépendant relie toute mise à jour d’apprentissage au résultat
vérifié de la recette complète.

La tranche demeure consultative. Elle ne démarre pas de daemons, n’altère pas les
leases, ne mute pas les types de workers et ne commite aucune transition. L’activation
est une décision d’architecture distincte, soumise aux portes de l’ADR 0430 et aux
affectations runtime effectivement observées.

## Options considérées

- **Énumérer le produit cartésien sans limite** : rejeté pour l’explosion combinatoire
  et la consommation incontrôlée du budget de recherche.
- **Choisir par score agrégé unique** : rejeté comme règle par défaut ; les poids
  cachent des arbitrages et peuvent masquer une faiblesse critique.
- **Classer le front Pareto puis s’abstenir sans priorité déclarée** : retenu ; le
  choix reste explicable et les cas où les preuves ne départagent pas les recettes
  restent visibles.
- **Activer immédiatement le candidat gagnant** : rejeté ; les résultats de
  compilation et d’estimation ne prouvent ni disponibilité runtime ni restauration
  correcte.

## Conséquences et qualification

Le générateur doit être déterministe pour une version figée des registres et un même
contexte. La limite de génération est incluse au reçu. Des tests doivent couvrir
l’explosion combinatoire, les variants inconnus ou non exécutables, les incompatibilités
et adaptateurs manquants, les budgets imbriqués, les leases expirées, les objectifs
incomparables, la dérive et l’abstention.

La qualification compare formes simples, topologies fixes, variantes, et recettes
imbriquées sous budgets appariés. Elle mesure la réussite selon oracle indépendant,
le coût total, la latence, l’abstention, la stabilité du classement et les erreurs de
sélection sur familles tenues à l’écart. Une recette composite ne reçoit pas une
qualité issue de la somme de scores corrélés de ses feuilles. Chaque résultat doit
être relié au commit et aux versions des registres ; aucun succès n’est déduit d’un
transport ou d’un score worker.

Le détail de conception et les limites présentes figurent dans
`docs/02-orchestration/morphogenese-strategie-adaptative.md`.
