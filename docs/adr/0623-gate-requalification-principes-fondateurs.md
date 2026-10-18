# ADR 0623 — Gate de requalification des principes fondateurs

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : qualification, preuve, gouvernance, documentation
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0604, ADR 0611, ADR 0613, ADR 0618b, ADR 0621, ADR 0622

## Contexte

Les six phases précédentes ont fermé une mission verticale, mais l'audit initial
des principes restait une matrice documentaire historique. Modifier ses cellules
à la main aurait confondu présence de code, exécution actuelle et portée réelle
de la conclusion. Une note maximale sans définition exécutable aurait également
contredit la règle « preuve avant promotion ».

La requalification doit donc établir ce qui est démontré sur un périmètre donné,
conserver les limites et échouer si une preuve disparaît. Elle ne doit pas
transformer la réussite des tests en autorité de promotion ou en garantie
universelle.

## Décision

Un manifeste canonique énumère exactement les dix-neuf principes fondateurs.
Pour chacun, il exige :

- une identité stable et une note égale à 4 ;
- un concept, une métaphore optionnelle et une capacité distincte ;
- au moins une référence d'implémentation, de test et de documentation ;
- au moins une limite non vide.

La note 4 signifie « parcours intégré requalifié par preuve exécutable, refus
observables et limites explicites ». Elle est bornée à la baseline et au scope du
manifeste.

Le service de qualification :

1. refuse toute référence absolue, traversée ou fichier absent ;
2. recalcule les digests du manifeste et des sources référencées ;
3. exige un résultat de code zéro, lié à la baseline, pour chaque test de la
   suite déclarée ;
4. produit un reçu avec `universalClaim: false` et
   `authorizesPromotion: false`.

Le test de phase 7 exécute réellement la suite, construit les observations et
vérifie aussi les chemins négatifs. Le reçu de cette exécution est versionné
avec le rapport de qualification.

## Conséquences

### Positives

- La note 4 a un sens reproductible et contrôlable.
- Chaque principe est lié à du code, une exécution, une documentation et une
  limite.
- Une métaphore ne peut pas être utilisée comme capacité dans le manifeste.
- Une preuve manquante ou un test en échec invalide toute la qualification.
- L'audit historique reste intact et le complément daté est traçable.

### Négatives et limites

- La campagne réexécute plusieurs tests déjà présents et augmente la durée de la
  suite P1.
- Le reçu lie les fichiers et sorties locales ; il n'atteste pas le matériel ou
  une indépendance organisationnelle des vérificateurs.
- Le gate ne scanne pas encore toutes les affirmations des documents historiques.
- La note 4 ne s'applique pas hors du scope déclaré.

## Preuves exécutables

- `node backend/tests/test_foundational_principle_contract.js` valide la forme,
  les références, les limites et la séparation sémantique ;
- `node backend/tests/test_foundational_principles_qualification.js` exécute les
  neuf preuves, produit le reçu 19/19 et vérifie les refus ;
- `npm --prefix backend run test:foundational-qualification` expose le gate aux
  opérateurs et à la suite P1.

## Alternatives écartées

- **Réécrire uniquement la matrice Markdown** : résultat non exécutable.
- **Attribuer 4 dès qu'un fichier existe** : présence sans comportement prouvé.
- **Omettre les limites pour présenter une complétude absolue** : affirmation
  plus forte que les preuves.
- **Autoriser la promotion depuis ce reçu** : confusion entre qualification et
  autorité.
