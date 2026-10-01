# ADR 0254 — Outcomes runtime vers plasticité et trajectoires AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, ingress runtime, apprentissage causal
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0242, ADR 0244, ADR 0245, ADR 0248

## Contexte

Les services AGOW de plasticité et de trajectoire demandaient un appel explicite; les
outcomes worker réels arrivaient déjà à `agowRuntimeIngressService`. Sans branchement,
les mécanismes ajoutés restaient principalement des API manuelles.

## Décision

Après admission d'un outcome worker, si un frame réel est disponible, l'ingress enregistre
une trajectoire compacte liée aux candidats déclencheurs, au frame, à la query et à
l'événement outcome. Il projette celle-ci dans la mémoire autobiographique via l'adaptateur.
L'outcome met à jour la plasticité contextuelle; si l'événement désigne un `pathwayId`, il
passe aussi par le service de décompilation. L'entrée `evidenceStatus` est par défaut
`reported`; seul un producteur qui fournit explicitement `verified` peut compter dans le
support de consolidation.

Les erreurs de plasticité ou de capture sont rendues dans `causalLearning` sans annuler
l'admission du candidat d'outcome. Les frames contrefactuels ne créent pas d'épisode réel.

## Conséquences

### Positives

- Un chemin d'outcome runtime alimente les stores de plasticité et de trajectoire.
- La provenance simulée reste séparée de la mémoire vécue.
- Une erreur de capture n'efface pas l'événement d'outcome déjà admis.

### Négatives

- Les trajectoires restent incomplètes quand aucun frame réel courant n'existe.
- La qualité des preuves `verified` dépend toujours du producteur.

## Alternatives

- Conserver les services non reliés aux events : rejeté, car les mécanismes ne recevraient
  pas d'expérience runtime ordinaire.
