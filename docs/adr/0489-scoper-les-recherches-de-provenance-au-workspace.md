# ADR 0489 — Scoper les recherches de provenance au workspace

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : `genos_blame`, `genos_lineage`, identité MCP et isolation des workspaces.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0488, bornes des recherches de provenance ; ADR 0487, reçus de communication inter-agents.

## Contexte

Les recherches `genos_blame` et `genos_lineage` acceptaient une cible globale.
Le registre MCP recevait l’identité du demandeur, mais la voie stratégie la
perdait avant la lecture de SQLite. Un agent autorisé par lease pouvait donc
interroger des événements et une filiation appartenant à un autre workspace.

## Décision

Le registre transmet l’identité du demandeur aux outils stratégie. Les lectures
exigent un agent demandeur rattaché à un workspace et une cible rattachée au
même workspace. Une cible absente, hors périmètre ou un demandeur sans scope
produit une réponse sans évidence et en échec, sans révéler l’existence de la
cible. La récursion de filiation vérifie le workspace de chaque nœud traversé
et de chaque arête retenue, tout en conservant la limite de 1 001 lignes de
l’ADR 0488.

## Conséquences

### Positives

- Une lease ne confère plus à elle seule l’accès aux données d’un autre workspace.
- Les cycles et les arêtes qui tentent de traverser une frontière restent bornés
  et ne sortent pas du workspace du demandeur.
- Les tests couvrent l’accès local, le refus inter-workspace, l’absence d’identité
  et le passage de l’identité par le registre MCP.

### Négatives

- Les agents sans workspace ne peuvent pas utiliser ces deux lectures, même pour
  des données globales.
- Les événements de blame restent indexés par agent; leur scope est établi par
  l’appartenance workspace de cet agent.

## Alternatives

- Faire confiance à la seule lease : rejeté, car elle autorise un outil et ne
  borne pas les lignes lues.
- Filtrer seulement les résultats après lecture : rejeté, car les données hors
  scope seraient déjà chargées et le lineage pourrait traverser une frontière.
