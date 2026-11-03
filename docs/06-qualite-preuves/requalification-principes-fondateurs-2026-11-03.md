# Requalification des principes fondateurs — 2026-11-03

- **Baseline conservée** : `2e30d2bada1b64eeadc38a8cf7f3015f7da1129b`
- **Révision des sources qualifiées** : `d2b13fffc4d26e40ebd2a641dda70b965d3bcb2c`
- **Périmètre** : mission verticale bornée couvrant les phases 1 à 6 du manifeste
- **Résultat de qualification** : 19/19 principes, onze programmes de preuve exécutés avec code zéro
- **Reçu courant** : [principes-fondateurs-2026-10-31.json](receipts/principes-fondateurs-2026-10-31.json)

## Dérive observée

Le gate global refusait le reçu courant avec
`The versioned qualification receipt is stale`. Les sorties des onze preuves
conservaient leurs empreintes, mais deux références d'implémentation avaient évolué :

- `backend/src/services/executionEnvelopeContract.js` ;
- `backend/src/services/missionEnvelopeAuthority.js`.

L'empreinte de sources attendue était
`713557769ea50dfdb62ae98f3507af866ee5ffc07e0aaf272ded641ed96cfc5c`.
L'empreinte des sources courantes est
`a3fd9bba5b720a907c7fc84d5038ac59a0b47b82556ea291f6a0c2ecc1706701`.

## Réexécution et renouvellement

La baseline, le scope, les dix-neuf principes et la suite de preuve restent
inchangés. Seule la révision d'ancrage du manifeste est actualisée vers les sources
committées courantes. Les 44 références ont été comparées à cette révision, puis
leurs empreintes ont été vérifiées avant et après l'exécution.

La commande officielle `node backend/bin/qualify-foundational-principles.cjs` a
réexécuté les onze programmes, chacun avec une base et un répertoire temporaires
isolés. Le nouveau reçu a été persisté après succès et contrôle de stabilité des
sources. Son hash est
`aec8d4f7569338b77062cb53e5c8d433d143cac606947eb94e62dc622d7cf194`.

Le chemin historique du reçu courant est conservé ; sa version antérieure reste
consultable dans Git à la révision d'ancrage. Le reçu historique `phase15` reste
distinct et continue d'être refusé pour dérive.

## Contrôles conservés

`node backend/tests/test_foundational_principles_qualification.js` a réexécuté
les preuves et confirmé l'égalité exacte du reçu, son statut `current`, la mise
en quarantaine du reçu historique et le refus des preuves manquantes ou en échec.
Les contrôles de fraîcheur, d'intégrité, de révocation, de signature et d'admission
ne sont pas modifiés. Le reçu garde `universalClaim: false` et
`authorizesPromotion: false` : cette qualification ne constitue pas une promotion.

## Validation globale

La relance complète a terminé avec les résultats suivants :

| Commande | Résultat observé |
| --- | --- |
| `npm test` | Code zéro, suite racine complète, dont le gate de qualification devenu `current` et la composition d'inventaire 14/14 |
| `cargo test --workspace` | Code zéro, 1 137 tests réussis, aucun ignoré |
| `python scripts/ci/check_code_quality.py` | Code zéro, 8 808 fichiers sources contrôlés, zéro violation |

Les 44 références de qualification ont conservé leurs empreintes jusqu'à la fin
de la suite npm. Les observations de qualification et les journaux de validation
ont été conservés dans le répertoire de preuve local de la session GenOS. La
réussite de ces suites ne confère toujours aucune autorité de promotion.
