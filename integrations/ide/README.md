<p align="center">
  <img src="../../assets/brand/genos-logo.png" width="112" alt="GenOS official logo">
</p>

# GenOS Studio IDE integrations

IDE adapters that forward a handful of commands to the GenOS backend and open
the corresponding Studio views.

## Contract

All clients share
[`genos-extension-contract.json`](./genos-extension-contract.json): three
commands (`workspace.open`, `compliance.generate`, `schema.status`), their
HTTP paths under `/api/ide`, and the authentication headers
(`Authorization`, `X-CSRF-Token`). The backend side is implemented by
`backend/src/controllers/ideController.js`.

## Adapters

| IDE | Location | Notes |
|---|---|---|
| VS Code | [`vscode/`](./vscode/) | Loadable as an extension folder; registers `genos.*` commands. |
| JetBrains | [`jetbrains/`](./jetbrains/) | Java action consuming the same command IDs (`GenerateComplianceAction`). |
| Antigravity | [`antigravity/`](./antigravity/) | Same HTTP contract, no dedicated plugin yet. |

## Configuration

Set the backend API base in VS Code with `genos.apiBase`
(default `http://localhost:4000/api`). The JetBrains and Antigravity adapters
read the same base from their settings when wired up.
