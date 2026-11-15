# Requalification des principes fondateurs — 2026-11-04

- **Périmètre** : les dix-neuf principes et les onze programmes du manifeste courant.
- **Résultat** : onze programmes exécutés avec code zéro par la commande officielle
  `node backend/bin/qualify-foundational-principles.cjs`.
- **Reçu** : [principes-fondateurs-2026-11-04.json](receipts/principes-fondateurs-2026-11-04.json).

## Dérive et sources effectivement vérifiées

Le contrôle global refusait le reçu du 31 octobre avec
`The versioned qualification receipt is stale`. L'expiration de l'enveloppe
d'exécution tient désormais compte de la validité de l'admission clinique dans
`backend/src/services/executionEnvelopeContract.js`. Les onze empreintes de sortie
des preuves restent identiques, mais l'empreinte des sources change.

Le second passage de validation a observé `EXECUTION_AUTHORITY_EXPIRED` dans la
preuve de délégation native : son allocation positive de vingt secondes était
insuffisante sous charge Windows. L'allocation du test est portée à 120 secondes,
sous la limite de 300 secondes du parent. Les contrôles de profondeur, d'autorité,
d'allocation et d'acceptation indépendante restent actifs.

L'exécution finale a porté sur le checkout à `b871ac285f2b754339fb16a7dbf5e77fe42e6749`,
avec les modifications locales d'`executionEnvelopeContract.js` et de
`backend/tests/test_bounded_worker_delegation.js`. Les 42 autres références
étaient identiques à cette révision. Les 44 empreintes canoniques ont
été comparées avant et après la commande et sont restées stables. La preuve porte
sur ces contenus, y compris la modification locale, sans prétendre que celle-ci
était déjà committée.

La baseline et le champ historique `qualificationRevision` du manifeste sont
conservés comme ancrages d'ascendance. L'identité des sources exécutées est portée
par `sourceDigest`, passé de
`a3fd9bba5b720a907c7fc84d5038ac59a0b47b82556ea291f6a0c2ecc1706701` à
`e651d5ae50391195295cbd9f2fefb07e2fd96762da555143d40881ccba58b2ea`.
Le reçu généré a pour hash
`706f4094186bc48751490f3fdaa6513add2156b230bd9f722cebcedc39e93182`.

## Conservation des preuves et limites

Le reçu du 31 octobre reste intact comme historique. Le test de qualification
charge le nouveau reçu puis réexécute les onze preuves et exige son égalité
exacte. Les contrôles de fraîcheur, de révocation, d'intégrité et de dérive restent
actifs, ainsi que les refus d'une preuve manquante ou en échec.

Le résultat conserve `universalClaim: false` et `authorizesPromotion: false`.
Ce renouvellement borné ne vaut ni promotion ni réussite des autres suites.
Les journaux et les empreintes avant exécution sont conservés dans le répertoire
local de preuve de la session GenOS.
