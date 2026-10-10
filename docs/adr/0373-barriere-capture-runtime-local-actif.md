# ADR 0373 — Capture du runtime local actif et reprise de session Codex

Statut : accepté, portée limitée
Date : 2026-10-10
Domaine : snapshots, supervision des processus
Lié à : [ADR 0370](0370-checkpoint-logique-local-et-continuite-llm-opaque.md)

## Contexte

Le snapshot d'agent refusait tout processus supervisé encore actif. Le runtime
local écrit déjà des checkpoints logiques aux étapes sûres, mais le backend ne
pouvait pas garantir que le processus ne modifierait pas le workspace pendant
la capture. Une image de la RAM exigerait un contrat de dump et de restauration
des descripteurs, connexions, processus enfants et ressources externes.

## Décision

- Le superviseur ouvre un canal IPC uniquement pour le runtime local GenOS.
- Une capture d'agent actif demande une pause identifiée par un nonce. Le
  runtime n'accuse réception qu'après avoir écrit un checkpoint `prepared`,
  `generated` ou `evaluated`. Il attend ensuite la libération du backend.
- Le backend capture alors les fichiers et les sections SQLite. Il vérifie que
  le checkpoint lu correspond à la phase accusée et que le processus supervisé
  existe toujours. Un délai de 30 secondes, une sortie ou une phase incohérente
  fait échouer la capture. La libération intervient aussi après une erreur.
- Les autres exécutables actifs restent refusés. La restauration exige toujours
  l'arrêt du processus et une relance explicite depuis son checkpoint logique.
- Le manifeste expose `runtime.activeCapture` et `runtime.pausedPhase`. Il garde
  `processMemory` à `unsupported`.

Le runtime Codex externe conserve, après un tour achevé, son journal de session
chiffré avec `GENOS_SECRET_KEY`. Le checkpoint lie le thread, l'agent, le
workspace et l'empreinte du journal. La restauration vérifie l'archive ; une
relance explicite avec `resumeCheckpointId` la déchiffre dans un nouveau
`CODEX_HOME` isolé avant `codex exec resume`. L'authentification et les règles
d'exécution sont recréées par le lanceur, hors du snapshot. Un journal absent,
altéré ou trop volumineux (8 Mio) est refusé.

## Limites

La barrière ne copie ni la RAM, ni les handles, ni les appels LLM en vol. Une
inférence ou un effet externe en cours peut dépasser le délai et bloque alors
la capture. Les mutations d'autres processus ne sont pas gelées par cette
barrière. Un tour Codex en cours ne peut pas être capturé par ce contrat ; seule
une session après `turn.completed` est archivée. Sans `GENOS_SECRET_KEY`, aucun
checkpoint Codex n'est publié. Aucun adaptateur CRIU/Linux ou équivalent
Windows n'est branché au superviseur : capturer un dump sans pouvoir raccorder
ses ressources externes à la restauration créerait une fausse garantie.

Le contexte caché brut du fournisseur LLM n'a pas de contrat d'export/import.
Les effets sur le workspace, SQLite, Rust et les systèmes externes ne sont pas
atomiques ensemble. Une restauration globale de l'organisme n'est pas annoncée.
