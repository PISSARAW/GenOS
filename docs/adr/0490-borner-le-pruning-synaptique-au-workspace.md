# ADR 0490 — Borner le pruning synaptique au workspace authentifié

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : `genos_synaptic_prune_scale`, autorité MCP et mutations du graphe mémoire.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0489, scope workspace des lectures de provenance ; ADR 0389, autorité des consommateurs mémoire.

## Contexte

`genos_synaptic_prune_scale` construit son filtre à partir de `agent_id`,
`organization_id` et `project_id` fournis par l'appelant. Sans ces champs, le
DELETE ne portait aucun filtre de scope; avec des champs forgés, il pouvait
cibler un autre agent ou tenant. La lease identifie l'outil autorisé, mais ne
confirme pas le propriétaire des synapses mutées.

## Décision

Le pruning exige une identité de demandeur liée à un workspace. Le workspace
est résolu depuis la ligne `agents`; les arguments de scope fournis par l'outil
sont ignorés. Une synapse est supprimée seulement si ses deux décisions
extrémités ont été créées par des agents du workspace authentifié, si son poids
ou son état d'opsonisation remplit le seuil, et si ses colonnes tenant sont
compatibles avec celles du workspace. Sans identité ou workspace résolu,
l'opération échoue avant le DELETE.

## Conséquences

### Positives

- Une lease et des arguments arbitraires ne permettent plus de supprimer des
  synapses d'un autre workspace.
- Un agent sans workspace ne peut pas déclencher une purge globale par omission
  de filtres.
- La requête garde le pruning conditionnel basé sur le poids et l'opsonisation.

### Négatives

- Les synapses dont une extrémité n'est pas attribuée à un agent du workspace
  restent hors du périmètre, même si leurs métadonnées tenant sont nulles.
- Les opérations globales de maintenance demandent un parcours administratif
  séparé, qui n'est pas fourni par cet outil MCP.

## Alternatives

- Continuer à faire confiance aux champs de scope des arguments : rejeté, car
  l'appelant peut les choisir.
- Autoriser sans filtre quand le scope manque : rejeté, car cela transforme une
  omission en mutation globale.
