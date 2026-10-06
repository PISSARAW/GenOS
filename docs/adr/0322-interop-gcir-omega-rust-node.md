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
versions acceptées et des rejets attendus. L'écriture canonique reste en v1.
Les lecteurs Node et Rust acceptent v0 et v1 : l'entrée historique v0 est migrée
explicitement vers v1. Les autres versions sont refusées avec le code
`omega.version_unsupported`. Les versions numériques hors plage ne doivent
pas être tronquées vers une version valide.

Les deux implémentations exposent les mêmes codes d'erreur pour schéma,
version, enveloppe, opération, doublon, trame et payload. Les tests négatifs
couvrent les erreurs de décodage et les mutations déterministes de 256 trames
par implémentation. La suite Node ajoute des campagnes property-based bornées,
avec graine fixée puis aléatoire, exécutées en CI. Leur succès décrit les
échantillons testés, pas une garantie sur toute entrée corrompue possible.

## Matrice d'exécution et frontière de production — 2026-10-06

`npm --prefix backend run test:interop` exécute également les six opérations
sur les huit domaines du catalogue partagé et quatre cas de refus : outil
interdit, objet absent, émission interdite et reçu contradictoire. Le test
compare statuts, raisons et valeurs Node/Rust. Il nécessite Cargo et utilise
l'exemple Rust `omega_execution_fixture`, distinct du serveur MCP.

Les résultats prédéfinis appartiennent exclusivement à ce pilote de test.
Le dispatch MCP Rust refuse les champs `toolResults`, `inferenceResults`,
`verificationReceipts` et `emissionResults` avec
`omega_untrusted_execution_results`. Les outils réellement dispatchés restent
soumis à la validation des chemins, des arguments et du lease. Aucun backend
d'inférence, de vérification ou d'émission de production n'est ajouté par les
fixtures ; son absence doit bloquer l'opération.

Voir l'[ADR 0323](0323-frontieres-preuve-execution-omega.md) pour la liaison
entre candidat, preuve et émission, et les limites de complétude.
