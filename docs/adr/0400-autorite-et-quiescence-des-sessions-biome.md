# ADR 0400 — Autorité et quiescence des sessions Biome

## Statut

Accepté le 11 octobre 2026.

## Contexte

Les opérations `genos_topology_session` de Biome acceptaient un identifiant de
session sans vérifier que l'appelant appartenait à cette session. Un cycle
arrêté par une condition terminale, notamment `max_ticks_reached`, conservait
le statut écologique `active`. L'adaptateur de snapshot refusait donc cet état
alors même que la boucle ne pouvait plus avancer.

## Décision

- Toute lecture et mutation de session Biome par le répartiteur topologique
  exige une identité d'agent persistée. Un worker doit porter le même
  `topologySessionId`. Un orchestrateur doit posséder un worker de cette session
  dans le même workspace. Si le contexte fournit organisation ou projet, ils
  doivent correspondre au workspace de l'agent. L'absence de liaison refuse
  l'opération.
- Une vérification positive de l'objectif termine l'écologie avec `completed`.
  Une condition d'arrêt effective sans vérification positive la place en
  `dormant`, tout en conservant la condition d'arrêt et le reçu de vérification
  distincts. Les tours encore exécutables restent `active`.
- Le snapshot Biome reste limité à une vérification de l'état collectif. Il
  refuse les écologies actives, les agents actifs, ainsi que les exécutions
  externes `running` ou `indeterminate`. Aucune restauration des effets
  collectifs ou externes n'est inférée d'un snapshot de workspace.
- Les reçus de sélection conservent l'identifiant canonique de la variante ;
  les empreintes spécifiques portent sur les champs réellement produits par
  leurs contrôleurs.

## Conséquences

Les anciennes sessions sans liaison persistée entre agent et session ne sont
pas accessibles par ce chemin de session. Un arrêt par limite d'appel `run`
sans condition d'arrêt persistée laisse la session active et ne donne pas à
lui seul le droit de capturer un snapshot topologique.
