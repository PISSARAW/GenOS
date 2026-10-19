# ADR 0646 — Sélection multisignal des buts GVX

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : GVX, curriculum, décision, provenance, autorité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0252, ADR 0261

## Contexte

La détection des lacunes GVX combine déjà plusieurs observations, puis le
curriculum vérifie les prérequis, l'autorité et le coût. Il manque néanmoins
une frontière explicite pour arbitrer plusieurs buts lorsque le progrès
d'apprentissage n'est qu'un signal parmi les besoins du projet. Un sélecteur
fondé uniquement sur ce progrès peut privilégier une compétence facile à
améliorer malgré un écart de trajectoire, un risque ou un besoin projet plus
important.

## Décision

Introduire `gvxGoalSelector.selectGoals`, un sélecteur pur qui évalue chaque
candidat avec sept dimensions explicites : besoin projet, écart de trajectoire,
risque, opportunité, incertitude, progrès d'apprentissage et coût. Chaque
signal porte une valeur bornée et des références de source. Le candidat porte
également sa propre référence et la date de l'observation.

L'autorité `goal:propose` et le budget sont des barrières dures, non des termes
compensables du score. Le coût intervient ensuite comme pénalité normalisée.
L'option `NO_CHANGE` possède une utilité explicite et gagne si aucun candidat
admissible ne la dépasse. Les égalités sont résolues par coût puis identifiant,
afin que le résultat soit rejouable pour des entrées identiques.

Le résultat reste une hypothèse. Il indique
`requires_external_dispatch`, `requires_independent_evidence`,
`autonomousExecution: false` et `promotionAuthorized: false`. Le sélecteur ne
persiste rien, n'appelle aucun outil d'exécution et ne promeut aucune mutation.

## Conséquences

### Positives

- Un fort progrès d'apprentissage ne masque plus à lui seul un besoin projet,
  un écart de trajectoire ou un risque supérieur.
- Les options refusées restent visibles avec leur statut et leurs données
  sources.
- L'inaction devient une décision explicite et falsifiable.
- Le dispatch et la promotion restent dans leurs frontières d'autorité et de
  preuve existantes.

### Négatives

- Les poids par défaut sont une politique initiale non calibrée.
- La qualité du classement dépend de la fraîcheur et de l'indépendance des
  sources fournies par l'appelant.
- Le sélecteur n'offre pas encore de persistance ou de calibration causale des
  poids.

## Alternatives

- **Classer seulement par progrès d'apprentissage** : rejeté, car ce signal ne
  représente ni l'urgence du projet ni son risque.
- **Transformer les permissions et le budget en pénalités** : rejeté, car une
  utilité élevée ne doit jamais compenser une interdiction.
- **Toujours choisir le meilleur score positif** : rejeté, car l'inaction peut
  être préférable lorsque la valeur attendue reste insuffisante.
- **Dispatcher depuis le sélecteur** : rejeté, car un classement n'est ni une
  autorisation d'exécution ni une preuve de succès.
