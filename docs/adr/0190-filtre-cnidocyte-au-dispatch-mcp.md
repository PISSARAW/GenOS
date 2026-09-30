# ADR 0190 — Filtre cnidocyte au dispatch MCP

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Décideurs** : Runtime GenOS

## Contexte

Le contrat MCP évaluait déjà le filtre cnidocyte, mais la grille ne disposait
pas d'une preuve que l'appel d'exécution effectif bloque un payload avant le
transport et conserve une latence observée.

## Décision

`mcpExecutor.execute` exécute `checkCnidocyteReflex` après la politique
d'autorisation et avant les autres inspections ou le transport. Une
interception est refusée, auditée dans `audit_logs` et publiée en télémétrie
avec signature et latence mesurée.

## Conséquences

- Un payload bloqué ne parvient pas au transport MCP.
- La latence concerne le filtre logiciel synchrone; elle ne représente pas une
  latence biologique et ne constitue pas une garantie de sécurité générale.
- Le test utilise une base simulée et bloque tout transport externe; un
  benchmark avec transport contrôlé reste à produire.

## Preuve

- `backend/src/services/mcpExecutor.js`
- `backend/src/services/mcpExecutor/cnidocyteRuntimeGate.js`
- `backend/tests/test_mcp_cnidocyte_runtime_gate.js`
