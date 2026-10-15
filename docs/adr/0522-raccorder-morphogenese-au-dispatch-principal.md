# ADR 0522 : Raccorder la morphogenèse au dispatch principal

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Orchestration, morphogenèse, topologies
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0076, ADR 0101, ADR 0108, ADR 0200

## Contexte

Le préparateur de mission acceptait les huit topologies canoniques et le planner
Morphogenèse construisait un graphe à partir du contexte réel. Le plan d'autonomie
continuait cependant à choisir ses workers avant cette sélection. Seules Trinity et
A-Team possédaient un remplacement dédié de `dispatchWorkers`; les six autres
composeurs restaient accessibles par leur entrée explicite sans gouverner le dispatch
principal.

Cette séparation pouvait produire un graphe correctement typé dont la racine était
ensuite liée à des workers issus d'une autre forme d'organisation.

## Décision

Le chemin principal exécute désormais une sélection morphogénétique avant la
construction du plan d'autonomie. La topologie sélectionnée devient la topologie
proposée de la mission. Le plan final est ensuite recalculé avec les affectations
réelles et sa racine est liée à ces mêmes affectations avant le dispatch.

Trinity et A-Team conservent leurs planificateurs dédiés, leurs contrôles de budget et
leurs gates propres. Une sélection explicite A-Team peut activer ce plan même lorsque
l'heuristique textuelle ne l'aurait pas recommandé. Si le plan dédié ne s'active pas,
la mission échoue fermé.

Biome, Biocénose, Holobionte, Métapopulation, Rhizome et Syncytium passent par
`biologicalTopologyService.composeMode`. Les membres orchestrateurs ne sont pas
instanciés comme workers. Tous les membres exécutables doivent tenir dans le fan-out
et recevoir leur allocation minimale; sinon la mission échoue avant toute création de
worker.

Une expression composite pilote toutes ses feuilles `TOPOLOGY`. Chaque worker porte
l'identité du nœud, de la topologie et du variant qui l'a composé. Le fan-out et le
budget s'appliquent à l'ensemble de la flotte. Après la barrière de preuve, le runtime
exécute l'opérateur racine sur les résultats vérifiés de ses feuilles.

À la frontière entre la première vague et la continuation, l'orchestrateur mesure le
score moyen d'évidence, sa dispersion et les échecs. Lorsque la politique adaptative
l'exige, il relance le planner et versionne une nouvelle expression : `COMPETE` pour
une preuve faible ou un échec, `FEDERATE` pour une forte dispersion, `SEQUENCE` dans
les autres adaptations. Les survivants gardent leur identité, leur contrat et le budget
de continuation déjà accordé. Le reçu conserve les graphes source et cible, les signaux
observés et la nouvelle feuille de chaque worker.

Une mission peut fournir `morphologyExpression` et `morphogenesisPolicy`; le pont accepte
aussi leurs alias en snake case. Cette réaffectation à une frontière quiescente ne
transfère pas l'état interne d'une topologie active. Un tel transfert continue d'exiger
un adaptateur, une adjudication et les reçus de gouvernance de Morphogenèse V2.

## Conséquences

- Les huit topologies canoniques peuvent maintenant déterminer les workers du chemin
  principal.
- Les graphes simples ou composites et `dispatchWorkers` portent les mêmes affectations.
- Les sessions et politiques propres aux six topologies biologiques sont créées lors
  de leur composition.
- Les preuves de la première vague peuvent modifier la forme de la continuation sans
  augmenter son budget ni changer le contrat des workers survivants.
- L'adaptation intervient actuellement à une frontière de continuation; elle ne forme
  pas encore une suite illimitée d'époques adaptatives.
- Une capacité ou un budget insuffisant bloque la mission au lieu de réduire
  silencieusement la forme sélectionnée.
- Le shadow V2 reste non committant et ne devient pas une autorisation de transition.
