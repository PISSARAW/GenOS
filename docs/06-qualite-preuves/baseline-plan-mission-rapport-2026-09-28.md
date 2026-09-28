# Phase 0.4 — Rapport de reference versionne

Cloture la Phase 0 du plan d'implementation complet.
Chaque controle a un resultat reproductible ou un blocage attribue.

## Resultats figes

| Controle | Resultat 2026-09-28 | Reproductible |
|---|---|---|
| Gate qualite global | Rouge : 3814 sources, 377 violations (157 nouvelles) | Oui (`python scripts/ci/check_code_quality.py`) |
| Gate staged (docs seules) | Vert : 0 source, 0 violation | Oui (hook pre-commit) |
| `npm test` backend | 55/55 vert | Oui (`npm --prefix backend test`) |
| `test:security` | 4/4 vert | Oui |
| `test:grpc` | 41/41 Ping OK, `StartMission` non couvert | Oui, manque de couverture transfere Phase 2.3 |
| Boucle autonome Rust | `drives boucle_autonome_sans_but_externe` vert | Oui (`--test drives`) |
| Atteignabilite services | 1820 / 1313 / 507 / 310 (+1 vs baseline) | Oui (`audit_service_reachability.js --json`) |
| MCP catalogues | 36/36 noms identiques | Oui (`shared/` vs `mcp/`) |

## Blocages attribues

- Dette qualite globale : proprietaire = chantiers en cours (arbre
  de travail + auteur concurrent) ; resorption hors baseline requise
  avant toute promotion. Fichiers locaux exclus du diagnostic versionne.
- Derive +1 service / +1 sans import : a expliquer en Phase 1.1,
  sans presomption de mort (imports dynamiques, registres, jobs, MCP).
- `StartMission` : sans test nominal/refus ; a couvrir en Phase 2.3
  avant d'augmenter les revendications de couverture.

## Decision de gate

**Aucune campagne de performance (Phase 7) ni promotion de capacite
(Phases 3–6) n'est autorisee** tant que sa baseline necessaire n'est pas
reproductible : gate global vert sur le perimetre touche, parcours
nominal + refus + recu versionne exiges. Les phases 1–2 reduisent
l'incertitude en premier (inventaires, contrats, matrices routes/RPC).
