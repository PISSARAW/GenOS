# ADR 0411 — Appelant lié à la session Syncytium

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Syncytium, identité MCP, frontières de session
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0405](0405-materialisation-syncytium-preuve-de-cloture.md)

## Contexte

Le garde MCP de Syncytium vérifiait qu'un worker déclaré appartenait à la
session avant une mutation. Un agent persistant d'un autre mode, y compris un
orchestrateur sans enfant dans la session demandée, franchissait le garde.
Une lease d'outil ne prouve pas l'appartenance à une session particulière.

## Décision

Lorsqu'un appelant est identifié, toute opération Syncytium exige soit un
worker dont la métadonnée persistée contient le `topologySessionId`, soit un
orchestrateur possédant un worker enfant du même workspace lié à cette session.
Les autres modes sont refusés. Les mutations continuent d'exiger une identité
d'appelant et leur acteur est lié à cette identité. Un appel de lecture sans
identité conserve le contrat historique de lecture sous lease ; il ne permet
aucune mutation et ne vaut pas preuve d'autorité de session.

Le garde est appliqué avant le dispatch de l'opération, notamment avant la
matérialisation. Un enfant d'une autre session, un enfant d'un autre workspace
ou un rôle inconnu n'autorise pas l'orchestrateur.

## Conséquences et limites

La matérialisation ne peut plus être demandée par un orchestrateur sans lien
persisté avec la session. Les lectures sans identité restent soumises aux
contrôles de lease et de transport existants ; une politique de confidentialité
par session pour ces lectures exigerait un contrat d'identité obligatoire sur
tous les clients MCP et n'est pas revendiquée ici. Le snapshot d'agent reste
`verify-only` et ne restaure pas le CRDT partagé.

`test_syncytium_caller_scope.js` vérifie les refus et le cas lié ;
`test_syncytium_materialization_mcp.js` garde le parcours SQLite/MCP.
