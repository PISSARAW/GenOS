# ADR 0398 — Capacité MCP et écritures directes

- **Statut** : accepté, couverture conditionnelle
- **Date** : 2026-10-11
- **Domaine** : identité d'agent, MCP Rust, fichiers, claims
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0397](0397-recus-corporels-et-limites-de-provenance.md)

## Contexte

Le serveur MCP Rust ne recevait aucune preuve d'acteur. Le manifeste de
fichiers attribuait seulement des changements survenus pendant l'exécution.
Les rapports de preuve du runtime n'étaient pas persistés comme claims avec
le run scellé connu du superviseur.

## Décision

Le superviseur Node émet une capacité aléatoire de 256 bits liée à l'agent,
au run scellé, au hash d'autorité, au workspace et à l'expiration. Il la
transmet uniquement à l'environnement du processus enfant. Pour un
`tools/call` Rust portant cette capacité, un pont Node relit l'autorité
courante, vérifie l'outil autorisé, inscrit une prédiction durable avant
l'exécution et clôt le reçu après le résultat. L'identité ne provient jamais
des arguments du client MCP. L'absence de capacité laisse l'appel externe et
non attribué. La capacité est révoquée à la fermeture du runtime. Une erreur
du pont refuse l'appel avant l'effet ; `omega/execute` est refusé sous une
capacité tant que ses sous-effets ne disposent pas du même contrôle.

Les effecteurs de fichiers de Solar direct et du modèle local émettent par
IPC le chemin et le hash des octets après chaque écriture. Ils attendent
l'envoi avant de clore le processus. Le superviseur ne classe comme
`directWrites` que les entrées dont le hash correspond au manifeste final.
Les autres changements demeurent `unattributedChanges` et le manifeste
global conserve `causality: temporal_only`.

Le superviseur persiste les affirmations du rapport de preuve avec son agent
et le run scellé acceptés par la couche d'exécution. Un identifiant dérivé du
run, de l'événement serveur et de l'index rend les reprises idempotentes. La
provenance du producteur est attestée ; la vérité du contenu reste
`self_reported` et la preuve invoquée par l'agent reste dans
`reportedEvidence` sans être promue en preuve indépendante. La qualité
épistémique initiale de ces assertions reste à zéro.

## Conséquences

### Positives

- Une requête Rust usurpant un identifiant dans ses arguments ne peut pas
  produire un reçu d'agent sans la capacité de mission.
- Les écritures directes Solar et modèle local sont séparées des changements concurrents
  observés uniquement à la clôture.
- Les claims émis en mission ont un producteur et un run vérifiables.

### Négatives

- Le pont Rust requiert Node, le code source du dépôt et le chemin de la base
  SQLite partagée transmis par le superviseur. La capacité de type bearer doit rester dans
  l'environnement du runtime ; son vol permettrait une usurpation pendant
  la durée de la mission.
- Les écritures d'un outil externe ou d'un autre effecteur non instrumenté ne
  sont pas prouvées causalement par le manifeste. Les fichiers exclus ne sont
  pas couverts. Un hash final divergent retire l'écriture de `directWrites`.
- Le contenu d'un claim auto rapporté peut être faux malgré une provenance
  de producteur authentifiée.

## Alternatives

- Prendre `agentId` depuis le JSON MCP : rejeté, car contrôlé par le client.
- Attribuer tout le diff du workspace à l'agent : rejeté, car les écritures
  concurrentes restent possibles.
- Promouvoir les preuves citées par le runtime en preuves vérifiées : rejeté,
  car elles ne passent pas de vérification indépendante.
