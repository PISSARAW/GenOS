# Requalification après les corrections Babel-Gödel — 2026-11-05

La validation générale a refusé le reçu des principes fondateurs avec
`The versioned qualification receipt is stale`. Le refus est conservé : les
empreintes du checkout exécuté diffèrent de celles du reçu historique.

La commande officielle `node backend/bin/qualify-foundational-principles.cjs`
a réexécuté les onze programmes du manifeste et qualifié les dix-neuf principes.
Les 44 empreintes canoniques des sources ont été capturées avant et après
l’exécution et comparées sans différence. Le reçu versionné existant
[est renouvelé](receipts/principes-fondateurs-2026-11-04-autorite.json) avec ce
résultat réel ; les assertions de dérive, fraîcheur et révocation sont conservées.

- Empreinte des sources : `e00cc4fd7205f8873a3f18e05880f100b96e8ef844edef9a461c9b10a2c49863`.
- Empreinte du reçu : `15ee3ec75dfcf312f0ee5e478ea4d096045f3524ae99da2589f01c97fab4a9e0`.
- Périmètre : les principes et références du manifeste courant, sans affirmation universelle.
- Promotion : `authorizesPromotion: false`, `universalClaim: false`.

Le checkout de référence est `1c62d709d91599542ca4ba8dbb5f91acc55989c3`.
Parmi les 44 références, il comprend une modification locale préexistante de
`mcp/toolCallHandler.js`, d’empreinte canonique
`7bd3294091d9870eb49d0c5ec39cbce1112a89ed1584e4aa22b450573fab6012`.
La preuve porte sur ces contenus exécutés ; elle ne prétend pas que cette
modification était déjà committée. La baseline et la révision historique du
manifeste restent des ancrages d’ascendance ; l’identité des sources est portée
par `sourceDigest`.

Les empreintes détaillées, le candidat du reçu et les journaux de commande
restent dans `.genos-agent-worlds/babel-foundation-*`, hors du suivi Git.
La qualification arithmétique et les génomes de Babel-Gödel sont décrits dans
[le bilan de la mission](../02-orchestration/analyse-echec-babel-goedel.md).
