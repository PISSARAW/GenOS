# ADR 0749 — Journal durable d’exécution G-CIR Ω

- **Statut** : Accepté — première tranche implémentée
- **Date** : 2026-10-28
- **Domaine** : Runtime G-CIR Ω, persistance, reprise, effets idempotents
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0016](0016-effets-runtime-philosophiques-controles.md), [ADR 0036](0036-harness-compatibility-layer.md)

## Contexte

Le runtime G-CIR Ω exécute ses opérations en mémoire. Le contrôle de journal du
benchmark OMEGA-BENCH ne constitue pas une preuve de reprise native. Il faut une
frontière durable côté runtime qui puisse restaurer des résultats complétés et
éviter de répéter un effet externe après une interruption.

## Décision

Le runtime accepte en injection une connexion SQLite et un `runId`. Il lie ce
dernier à un condensat canonique de la requête, puis écrit une intention avant
chaque opération et son résultat après exécution. Une réouverture peut rejouer les
résultats complétés sans rappeler leurs handlers. Une opération inachevée est
reprise uniquement pour `CALL` et `EMIT` dont le handler a été enregistré avec
`{ idempotent: true }`; le même `idempotencyKey` stable lui est transmis. Le
handler externe doit dédupliquer effectivement cette clé. Sans cette déclaration,
le runtime bloque l’effet. Une même clé de run ou d’opération liée à une requête
différente est rejetée. Le condensat du résultat est contrôlé à chaque lecture du
journal afin de refuser une sortie altérée.

Cette tranche ne garantit pas à elle seule l’atomicité d’un effet situé hors de
SQLite. La reprise sûre d’un effet interrompu dépend du contrat d’idempotence du
handler externe. L’état `running` demeure une intention durable, pas une preuve
que l’effet externe a été commis.

## Conséquences

### Positives

- Les sorties complétées et le résultat final peuvent être reconstruits depuis le
  journal sans rejouer les handlers.
- Une reprise d’effet reçoit une clé stable et ne peut être activée qu’avec une
  déclaration explicite d’idempotence.
- Le journal est injectable; le comportement historique sans journal demeure
  disponible.

### Négatives

- L’application doit fournir et gérer la connexion SQLite ainsi qu’un `runId`
  stable pour les reprises.
- La garantie d’effet « une fois » reste conditionnée à la déduplication réelle
  du handler; le runtime seul n’offre qu’une coordination durable.
- La reprise d’exécution reste séquentielle et ne répare pas les effets de handlers
  qui ignorent leur clé.

## Alternatives

- Laisser la journalisation au harnais : écarté, car cela ne prouve pas l’exécution
  native du runtime.
- Relancer systématiquement tout effet en attente : écarté, car cela peut dupliquer
  un effet déjà commis avant la panne.
- Refuser toute reprise d’effet en attente : conservé comme comportement fail-closed
  lorsque le handler n’annonce pas l’idempotence.
