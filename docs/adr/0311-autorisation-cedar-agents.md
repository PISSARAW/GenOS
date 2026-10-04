# ADR 0311 - Autorisation Cedar des missions et du contrôle d'agents

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : autorisation, missions, délégation, relations
- **Décideurs** : équipe GenOS
- **Lié à** : [Autorité des agents](../01-concepts/runtime-agentique.md)

## Contexte

Le runtime contrôlait les missions et les commandes d'agents avec des tests
dispersés. Une relation de morphogenèse de type `manager`, `guardian`, `mentor`
ou `parent` pouvait accorder le contrôle d'un agent sans délégation explicite.
Cette interprétation élargissait l'autorité lorsqu'une relation changeait.

## Décision

Les décisions `StartMission` et `Control` passent par une politique Cedar
versionnée et validée strictement contre un schéma au chargement du backend.
Les identités, modes d'exécution, parents et workspaces viennent des lignes
persistées. La requête Cedar lie le principal, l'action, la ressource et le
workspace. Une réponse absente, erronée ou `deny` bloque l'opération.

Les contrôles existants de quarantaine, fraîcheur de mission et bail d'outils
restent des préconditions. La décision finale de contrôle d'agent ne dépend
plus d'une relation biologique ou organisationnelle. Une relation peut aider
à choisir un candidat, mais ne confère aucune permission. Le pointeur
`parent_agent_id` persisté reste une délégation structurelle explicite.

Le périmètre de ce lot est la frontière d'autorité des agents. Les appels MCP
conservent leur bail et leurs contrôles de transport existants ; la politique
Cedar de ce lot ne constitue pas une autorisation générale des outils.

## Conséquences

### Positives

- Les missions et le contrôle des agents utilisent un moteur d'autorisation
  commun avec refus par défaut.
- Une mutation de relation ne peut plus étendre les droits de contrôle.
- Le schéma et les tests couvrent les identités, workspaces et rôles différents.

### Négatives

- Le backend dépend du module WebAssembly officiel de Cedar.
- Les anciens usages qui reposaient uniquement sur une relation doivent
  obtenir une délégation structurelle autorisée avant de contrôler un agent.

## Alternatives

- Conserver les tests conditionnels JavaScript : la politique reste dispersée.
- Accorder directement les droits à partir des relations : une mutation de
  topologie devient une mutation d'autorité implicite.
