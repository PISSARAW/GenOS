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

## Compatibilité et robustesse

La matrice `spec/g-cir-omega-compatibility.json` est la source de vérité des
versions acceptées et des rejets attendus. La version 1 est actuellement la
seule version supportée ; les versions futures ou historiques sont refusées
avec le code `omega.version_unsupported`, sans conversion silencieuse.

Les deux implémentations exposent les mêmes codes d'erreur pour schéma,
version, enveloppe, opération, doublon, trame et payload. Les tests négatifs
couvrent les erreurs de décodage et les mutations déterministes de 256 trames
par implémentation. Ces tests bornés ne remplacent pas un fuzzing non borné,
mais garantissent qu'une entrée arbitrairement corrompue ne provoque ni panic
Rust ni exception Node non typée.
