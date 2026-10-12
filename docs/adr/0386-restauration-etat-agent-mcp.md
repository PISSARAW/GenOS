# ADR 0386 — Restauration d'état d'agent par l'entrée MCP temporelle

- **Statut** : accepté pour l'entrée backend hors catalogue public
- **Date** : 2026-10-10
- **Domaine** : MCP, snapshots d'agent, restauration
- **Décideurs** : équipe GenOS
- **Lié à** : [outils MCP](../03-reference/outils-mcp.md)

## Contexte

Le nom historique `genos_temporal_consciousness_transfer` désignait une simulation
hors catalogue public. La restauration vérifiable de l'état logique et du
workspace existe déjà dans le contrôleur de snapshots de lignée. Le nom
« conscience » ne peut pas être pris au sens phénoménal ou comme preuve de
continuité subjective.

## Décision

L'action `restore_snapshot` (et l'ancien `execute_transfer` sans mémoires
futures) délègue au restaurateur de snapshots scellés. L'appel exige une lease
pour l'outil, `GENOS_MCP_ALLOW_AGENT_RESTORE=true` et les deux variables de
portée **côté serveur** `GENOS_MCP_ORGANIZATION_ID` et `GENOS_MCP_PROJECT_ID`.
L'agent et le snapshot doivent appartenir à cette portée ; le snapshot doit
porter un manifeste d'organisme scellé. Le restaurateur existant impose
l'arrêt du runtime, vérifie l'intégrité et prépare un snapshot de sécurité.

Le reçu `agent_state_restored` ne peut être émis qu'après le retour réussi du
restaurateur. Il signale explicitement `consciousnessTransferred: false` et
`futureMemoriesInjected: 0`. Toute injection de « mémoires futures » est
refusée. L'action `status` reste une lecture de simulation et ne prouve aucune
restauration. L'outil reste hors catalogue public ; son effet est qualifié
par `test_mcp_agent_state_restore.js` avec un vrai snapshot et un workspace.

## Conséquences

- **Positives** : l'ancien nom pointe vers un effet opérationnel borné et
  réutilise les gates de restauration existants sans fabriquer de continuité.
- **Négatives** : un processus MCP non configuré refuse l'action ; la mémoire
  de processus et le contexte caché d'un fournisseur ne sont pas restaurés.
  La qualification est limitée au chemin backend local, sans exposition stdio
  dans les catalogues publics Node et Rust.

## Alternatives

- Activer la simulation en la déclarant « transfert » : rejeté.
- Accepter une portée organisation/projet fournie par l'appelant : rejeté,
  car cela permettrait de choisir sa propre autorité.
