# ADR 0322 — Interopérabilité G-CIR Omega Rust/Node

- Statut : Accepté
- Date : 2026-10-05
- Domaine : G-CIR Omega, protocole binaire, MCP, Rust/Node
- Décideurs : Équipe GenOS

## Contexte

Les runtimes Node et Rust pouvaient manipuler des données cognitives, mais ne
partageaient ni schéma Omega canonique, ni vecteurs binaires, ni test de
compatibilité formel.

## Décision

Le contrat canonique est `genos.gcir.omega/v1`, défini par
`spec/g-cir-omega.schema.json`. Le transport binaire est un tableau MessagePack
positionnel stable : schema, version, id, opérations, policy et payload JSON
canonique UTF-8. Le fichier `spec/g-cir-omega-vectors.json` contient les octets
et le digest de référence. Node utilise `cognitiveOmegaInteropService`; Rust
utilise le module `genos-mcp::omega`.

## Invariants

1. Les deux implémentations valident les mêmes six types d'opérations et les mêmes bornes.
2. Les identifiants d'opérations sont uniques et le format est versionné.
3. Un vecteur partagé doit être identique octet par octet et par SHA-256.
4. Une incompatibilité ou un payload invalide bloque le décodage.
5. Une évolution incompatible exige une nouvelle version de schéma et de vecteurs.
