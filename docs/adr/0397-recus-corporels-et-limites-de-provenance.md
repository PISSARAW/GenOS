# ADR 0397 — Reçus corporels et limites de provenance

- **Statut** : accepté, portée Node et missions scellées
- **Date** : 2026-10-10
- **Domaine** : modèle corporel, autorité de mission, MCP, provenance des claims
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0396](0396-frontiere-corporelle-agent-et-provenance.md)

## Contexte

Les sondes du corps distinguaient les ressources internes et le workspace, mais
plusieurs effets réels n'avaient aucun reçu durable. Une propriété
`sensorOwnerAgentId` construite depuis le contexte ne prouvait pas l'identité
du capteur. De même, `producer_agent_id` pouvait être fourni sans autorité
scellée. Un appel MCP direct pouvait être externe au runtime d'agent.

## Décision

Une action d'une mission Node scellée reçoit un identifiant unique, le hash
de son enveloppe d'autorité, une prédiction et un résultat persistés dans
`body_action_receipts`. L'observation est consommable une seule fois pour le
même agent, run et effecteur. Le lancement de processus, le dispatch de workers
et l'exécution MCP liée à un agent empruntent ce registre. Les appels MCP
directs sans acteur scellé sont audités comme externes ou non attribués.
La copie d'efférence du processus est consommée seulement après que le
superviseur a observé sa sortie et clos le reçu. Le dispatch reprend aussi
l'identifiant de l'action supervisée dans son événement de réconciliation.

Le corps construit depuis un contexte local porte `context_unverified`.
Après scellement, l'autorité lie le propriétaire de ses percepts au run ;
`owner_bound` ne certifie pas la valeur mesurée ni le monde observé.
L'observation de fichiers compare deux manifestes du workspace pour un
runtime local. Elle est limitée aux fichiers éligibles à la capture et décrit
une corrélation temporelle, jamais une causalité exclusive.

Un nouveau claim ne reçoit un `producer_agent_id` exploitable par CoreSelf
que si son producteur et son run passent la vérification de l'enveloppe
scellée. Le hash et le run sont conservés. Les claims historiques sans cette
preuve restent hors de `selfOriginRatio` ; une révision ne leur attribue pas
rétroactivement une origine vérifiée.

## Conséquences

### Positives

- Les effets Node liés à un run ont une identité persistante et vérifiable.
- Une observation étrangère ou répétée ne clôt pas le reçu d'un autre agent.
- Le modèle distingue l'identité du propriétaire, la provenance du signal et
  la portée de la preuve effectivement disponible.

### Négatives

- Le temps de lancement et de clôture d'un runtime local augmente lorsque le
  manifeste de fichiers est capturé. Si les limites sont dépassées, le reçu
  indique `unobserved`.
- Les appels stdio MCP Rust, les missions historiques non scellées et les
  changements de fichiers concurrents ne fournissent toujours pas une preuve
  corporelle attribuable à un agent. Le résultat Rust stdio porte seulement
  une métadonnée `external_unattributed`.
- Les anciens claims avec un producteur textuel n'alimentent plus le ratio du
  soi tant qu'une preuve d'autorité initiale n'existe pas.
- Le producteur de nouveaux claims épistémiques du runtime n'émet pas encore
  de `runId` scellé. Le ratio reste donc absent pour ces claims ; l'API refuse
  d'inventer un producteur.

## Alternatives

- Accepter le nom d'agent ou le texte d'un événement comme preuve : rejeté,
  car ces champs peuvent désigner la cible ou être fournis par le client.
- Imputer tous les changements du workspace au processus observé : rejeté,
  car un autre processus peut modifier les mêmes fichiers dans l'intervalle.
- Faire passer les appels stdio Rust pour des actes d'agent en l'absence
  d'identité transportée et validée : rejeté.
