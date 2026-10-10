# ADR 0390 — Fork d'agent depuis un snapshot scellé

- **Statut** : expérimental, service backend direct
- **Date** : 2026-10-10
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0366, 0367 et 0368
- **Domaine** : snapshots, workspaces isolés, filiation et budget

## Contexte

La commande `genos_v2_fork` refuse le fork, faute de création d'un état enfant
et d'une filiation persistante. Le clone du contrôleur de lignée crée un agent
inactif dans le workspace parent. Le fork de reproduction peut démarrer un
worker, mais prépare son workspace à partir du workspace courant, sans ancrage
à un snapshot d'organisme scellé. Aucune de ces opérations ne prouve à elle
seule le fork d'un état antérieur précis.

## Décision

`sealedAgentForkService.forkFromSealedSnapshot` accepte une base de données
transactionnelle, une portée organisation/projet, un agent, un snapshot, une
clé d'idempotence, un budget entier et une racine de fork **fournie par le
serveur**. Il vérifie le manifeste d'organisme, la référence et le manifeste
du snapshot de workspace ainsi que l'identité de l'agent et la portée.

Le service matérialise les fichiers vérifiés dans un workspace enfant hors du
workspace parent. Il crée ensuite dans une transaction SQLite le workspace,
l'agent inactif, une ancre de snapshot, le nœud enfant et l'arête de filiation.
La même transaction réserve le budget enfant en le débitant du parent. Les
identifiants dérivent de la portée, de la source et de la clé d'idempotence.
Une reprise de la même requête vérifie les fichiers matérialisés et retourne
le même enfant sans nouveau débit. Si une interruption survient après la
matérialisation et avant la transaction, le répertoire orphelin ne peut être
repris qu'avec sa provenance et ses octets intacts.

## Limites

Le fork copie les fichiers du snapshot et la configuration bornée de l'agent.
Il ne copie pas les mémoires relationnelles, le runtime, la RAM, le contexte
caché du modèle ni les effets externes. L'enfant est `idle` ; un lancement
ultérieur demande une autorité et une politique d'exécution distinctes. Le
reçu expose `runtimeStarted: false`, `memoryCloned: false` et
`organismRuntimeRestored: false`. Le parent perd le budget réservé dès la
création ; le fork ne donne aucune autorité de promotion ou de fusion.

## Exposition MCP

Une entrée MCP peut appeler ce service uniquement sous lease adaptée, avec
`GENOS_MCP_ALLOW_AGENT_FORK=true`, une portée organisation/projet de confiance,
une racine de fork et l'identité de l'agent déterminées côté serveur. Le reçu
MCP doit conserver `runtimeStarted: false` et les limites ci-dessus. Les
arguments du client ne peuvent choisir librement une racine de fichiers ni
transformer le succès du transport en preuve d'exécution d'un enfant.

## Vérification

`backend/tests/test_sealed_agent_fork_service.js` vérifie la portée, le
manifeste scellé, l'isolation des fichiers, la filiation, le budget et la
reprise idempotente. Les échecs de persistance doivent laisser la transaction
SQLite intacte ; le répertoire matérialisé reste vérifiable pour une reprise.
