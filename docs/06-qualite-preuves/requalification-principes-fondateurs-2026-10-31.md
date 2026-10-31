# Requalification des principes fondateurs — 2026-10-31

- **Date** : 2026-10-31
- **Baseline conservée** : `2e30d2bada1b64eeadc38a8cf7f3015f7da1129b`
- **Révision de qualification** : `d6ca69c7252d1c1bc883a41dfb47eb9eae62963a`
- **Périmètre** : mission verticale bornée couvrant les phases 1 à 6
- **Résultat** : 19/19 principes à la note 4 dans ce périmètre borné
- **Reçu** : [principes-fondateurs-2026-10-31.json](receipts/principes-fondateurs-2026-10-31.json)

## Résultat

La commande de qualification a réexécuté les onze tests d’évidence déclarés par
le manifeste. Chaque test a terminé avec le code zéro. Le reçu lie leurs
empreintes de sortie au manifeste et à l’empreinte des sources référencées au
moment de cette qualification. Le contrôle d’intégrité et de cycle de vie est
rejoué par `backend/tests/test_foundational_principles_qualification.js`.

Cette requalification conserve la baseline d’origine. Elle actualise la
révision de qualification et le reçu, car des sources incluses dans le
manifeste avaient évolué depuis la qualification précédente. Elle ne confère
aucune autorité de promotion et ne revendique pas une couverture universelle.

## Vérification

```powershell
node backend/bin/qualify-foundational-principles.cjs
node backend/tests/test_foundational_principles_qualification.js
```

Le reçu indique `universalClaim: false` et `authorizesPromotion: false`.
