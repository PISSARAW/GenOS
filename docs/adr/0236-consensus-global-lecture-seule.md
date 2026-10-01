# ADR 0236 — Consensus global en lecture seule

## Contexte

Les 19 organisations calculent un quorum/Brier local par orchestrateur, à
partir de ses messages (`vote`, `evidence`, `trace`). Il n'existe aucun
consensus inter-orchestrateurs. Prétendre un accord global d'écriture à
partir d'une moyenne silencieuse serait faux.

## Décision

Exposer une agrégation globale strictement en lecture seule :
par orchestrateur, `reached`, `support`, `abstentions` et poids, puis un
résumé pondéré avec provenance (un snapshot par orchestrateur). Aucune
écriture, aucune décision contraignante, aucun effet de bord. Chaque
orchestrateur reste souverain sur son organisation. Les seuils et les
absences de votes sont explicites dans le reçu.

## Conséquences

Pas de garantie BFT ni de quorum d'écriture. SQLite WAL local uniquement ;
aucune synchronisation réseau. Un résumé global ne prouve ni accord réel
ni vérité externe. Le Brier reste sans vérité résolue quand
`resolvedOutcome` est absent.

## Alternatives

Un consensus d'écriture distribué (Raft/BFT) est un chantier distinct qui
exige transport, identité et stockage adaptés : rejeté ici. Une moyenne
sans provenance est rejetée car elle masque les désaccords.
