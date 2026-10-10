# ADR 0394 — Préflight vérifiable de restauration d'organisme

- **Statut** : accepté, portée limitée
- **Date** : 2026-10-10
- **Décideurs** : équipe GenOS
- **Domaine** : snapshots d'organisme, restauration same-agent
- **Complète** : [ADR 0367](0367-sections-durables-snapshot-organisme.md), [ADR 0368](0368-reprise-curseur-mission-et-frontieres-runtime.md)

## Contexte

`POST /agents/restore` restaure un snapshot du même agent. Les octets du
workspace, les têtes de checkpoints Rust et les lignes SQLite sont modifiés en
phases distinctes. Les compensations sur exception ne rendent pas ces domaines
atomiques en cas d'arrêt du processus. Un client a besoin de connaître les
refus détectables avant de déclencher la restauration.

## Décision

`POST /agents/restore/inspect`, protégé par la permission `read` et la portée
tenant habituelle, accepte `agentId` et `snapshotId`. Le service
`organismRestorePreflight.inspect({db,scope,agent,state})` produit un reçu
`ready`, `blockers`, `domains`, `runtimeRestartRequired`,
`readinessScope:'instantaneous'` et `globalAtomic:false`. Il ne modifie ni
l'agent, ni ses fichiers, ni les curseurs Rust.

Le préflight exige un snapshot d'organisme scellé et l'identité du même
agent/workspace dans la portée tenant. Les anciens snapshots dépourvus de
manifeste vérifiable restent lisibles par les anciennes routes, mais le
préflight les refuse. Pour le workspace, il compare la référence scellée à la
ligne du snapshot, vérifie le manifeste, son agent et son identifiant, puis
chaque octet de payload par SHA-256 sans le matérialiser dans le workspace.
Pour SQLite, le préflight et le restaurateur partagent la même validation des
sections, propriétaires, relations, curseurs, colonnes et inférences `pending`.
Il vérifie aussi les références Rust, la cohérence des missions, l'absence de
processus actif et les checkpoints de runtime disponibles.

Les motifs sont structurés par domaine et code. Leur message public ne
contient ni chemin local ni donnée du snapshot. Un `ready:true` constate
uniquement les conditions au moment de la lecture. Le mutateur revalide à son
tour ; le reçu n'est ni un verrou ni une autorisation de promotion.

## Conséquences

Une corruption de payload, une ligne hors tenant, un runtime actif ou une
inférence en cours sont visibles avant toute mutation. Les préflights sans
snapshot scellé échouent explicitement. Le même validateur SQLite réduit le
risque que l'inspection et la restauration acceptent des contrats divergents.

## Limites et alternatives

Le préflight ne ferme pas la fenêtre de panne entre filesystem, Rust et SQLite.
Un journal durable d'intention, des snapshots de sécurité, des phases
idempotentes et une récupération au démarrage restent nécessaires avant de
qualifier l'opération de résistante aux interruptions. Une simple route
renommant la restauration en « transfert de conscience » tromperait le
client ; ce nom n'est pas adopté.
