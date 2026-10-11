# ADR 0405 — Matérialisation Syncytium avant preuve de clôture

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Syncytium, MCP, clôture de mission
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0331](0331-syncytium-rejeu-causal-et-preuve-de-completion.md), [runtime Syncytium](../03-reference/runtime-syncytium.md)

## Contexte

La clôture Syncytium exige un snapshot matérialisé à la version courante. La
passerelle MCP exposait la lecture `snapshot`, mais pas la création d'un snapshot
durable. Le dispatch pouvait donc disposer d'opérations et de réponses de workers
valides tout en restant `partial` faute de matérialisation accessible.

## Décision

`genos_topology_session` expose `operation: "materialize"` pour les sessions
Syncytium. C'est une mutation : le garde d'appelant exige une identité de worker
liée à la session. Le service refuse l'état vide, les invariants divergents et
les réplicas actifs hors frontière ou avec opérations en attente. Il persiste le
snapshot sous la coordination existante, relit l'état et ne rend un reçu
`verified` que si la validation autoritative reconnaît ce snapshot précis.

Après la validation sémantique et la terminaison des workers, le dispatch peut
matérialiser l'état cohérent avant la validation finale. Un refus laisse la
mission `partial`; il ne transforme ni une réponse de worker ni un transport
réussi en preuve d'état.

La reprise de workspace associée au snapshot topologique reste `verify-only`.
Elle ne restaure pas le CRDT partagé. Une reprise collective future exige une
frontière quiescente, un journal causal et des réplicas coordonnés, un replay
idempotent, puis une nouvelle validation des invariants et des preuves métier
de chaque variant.

## Conséquences

### Positives

- Une mission peut produire le snapshot durable exigé par sa clôture via MCP ou
  après les workers, avec un reçu lié à la version et au `snapshotId`.
- Les réplicas non réconciliés et les invariants en échec bloquent la
  matérialisation avant publication du reçu.

### Négatives

- Une opération concurrente peut rendre un snapshot immédiatement périmé ; la
  validation finale doit rester obligatoire.
- Aucun rollback collectif du CRDT ni des effets externes n'est fourni.

## Alternatives

- **Supprimer l'exigence de matérialisation** : rejeté, car la clôture perdrait
  sa preuve de frontière causale durable.
- **Matérialiser sans préconditions** : rejeté, car un snapshot d'état divergent
  ou de réplicas en retard ne peut pas certifier la cohérence.
