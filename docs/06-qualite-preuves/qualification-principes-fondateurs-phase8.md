# Qualification révocable des principes fondateurs — phase 8

- **Date** : 2026-10-18
- **Baseline fonctionnelle** : `2e30d2bada1b64eeadc38a8cf7f3015f7da1129b`
- **Ancre de qualification** : `77d00247af600452a7ca08004262b22fee97ae35`
- **Résultat courant** : 19/19 principes à la note effective 4
- **Reçu v2** : [principes-fondateurs-phase8.json](receipts/principes-fondateurs-phase8.json)

## Changement de sémantique

La note 4 n'est plus seulement portée par un reçu historique. Le gate relance
les dix preuves, recalcule les digests, vérifie la fraîcheur des observations et
consulte le registre canonique de révocations. Il produit alors un état :

| État | Note effective | Cause |
|---|---:|---|
| `current` | 4 | reçu intact, sources identiques, preuves fraîches, aucune révocation |
| `quarantined` | aucune | dérive, altération, preuve périmée ou registre invalide |
| `revoked` | aucune | contre-preuve ou décision visant explicitement le hash du reçu |

Dans les trois cas, `authorizesPromotion` reste faux. Le résultat qualifie le
périmètre déclaré ; il ne remplace ni une décision de promotion ni une vérité
universelle.

## Preuves et refus observés

La campagne a exécuté les dix tests du manifeste avec code zéro. Le test du
cycle de vie a ensuite observé les refus suivants :

- une sortie de preuve modifiée place le reçu en quarantaine pour dérive ;
- une observation plus vieille que quinze minutes retire la note effective ;
- un reçu dont le contenu ne correspond plus à son hash est refusé ;
- une entrée autorisée visant le hash courant produit l'état `revoked` ;
- `assertCurrent` refuse tout état autre que `current`.

Le reçu v2 lie séparément la baseline fonctionnelle, l'ancre Git de la campagne,
le manifeste, les sources et les sorties de test. Le registre vide courant est
[`shared/foundationalQualificationRevocations.json`](../../shared/foundationalQualificationRevocations.json).

## Limites conservées

- La fraîcheur de quinze minutes est une politique locale configurable.
- Le registre est protégé par la gouvernance Git, sans signature externe dans ce lot.
- Le digest couvre les références du manifeste, pas chaque fichier du monorepo.
- La suite globale Node et la reconstruction Rust complète restent des gates
  distincts ; leur état ne peut pas être converti en succès par ce reçu.
