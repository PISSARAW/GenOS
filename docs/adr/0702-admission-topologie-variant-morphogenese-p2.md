# ADR 0702 — Admission topologie–variant de morphogenèse P2

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Morphogenèse, variants, admission, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0430, ADR 0610, ADR 0700

## Contexte

P1 ferme le cycle commun `observe → quiesce → snapshot → adapt → verify →
finalize` et restaure après un échec post-snapshot. Cette qualification porte sur
les handlers du port topologique. Elle ne lie pas encore la transaction au variant
exact sélectionné par le plan et n'établit pas que ce variant possède une
persistance, un snapshot, une restauration et une campagne bout-en-bout vérifiés.

Le catalogue sépare déjà ces dimensions dans `VariantSpec`, mais un état textuel
`verified` sans référence de preuve pourrait être forgé. À l'inverse, la maturité
fonctionnelle d'un variant ou la réussite du transport ne prouve pas sa capacité à
participer à une transition structurelle réversible.

## Décision

`VariantSpec` v3 ajoute `qualificationEvidence`, une liste de références par
dimension de qualification, et valide les noms de dimensions ainsi que les états.
Les données historiques restent lisibles : une dimension sans preuve reçoit une
liste vide et n'est pas promue implicitement.

Le gate P2 lie avant toute observation :

1. la topologie et le variant explicitement demandés par le plan ;
2. l'identité du `VariantSpec` issu du registre ;
3. la topologie portée par le `TopologyRuntimePort` ;
4. cinq qualifications obligatoires — liaison runtime, persistance, snapshot,
   restauration et bout-en-bout — toutes à `verified` avec au moins une référence
   de preuve.

Une admission réussie produit un reçu et un digest déterministe de la qualification,
puis délègue exclusivement au coordinateur transactionnel P1. Le résultat conserve
`promotionEligible: false` : le bénéfice empirique et l'autorité de promotion sont
des gates distincts. Une transaction réussie ne s'auto-promeut jamais.

Les huit topologies et leurs variants actuels restent refusés. P2 ne transforme pas
leur maturité fonctionnelle en preuve de restauration spécialisée. Un chemin
contrôlé exécute le vrai gate et le vrai coordinateur dans la suite de tests afin de
qualifier le protocole commun, sans être publié comme variant de production.

## Conséquences

### Positives

- Aucun variant ne peut emprunter le cycle P1 avec de simples assertions textuelles.
- Le plan, le registre et le port doivent désigner exactement la même topologie et
  le même variant.
- Les preuves nécessaires sont exposées dans un reçu d'admission reproductible.
- La qualification peut progresser variant par variant sans ouvrir les autres.
- L'exécution et la promotion empirique demeurent deux décisions séparées.

### Négatives et limites

- Aucun variant des huit catalogues n'est encore admis en production.
- Les références sont liées et exigées, mais leur autorité cryptographique relève
  encore des campagnes de qualification spécialisées.
- Le digest protège la représentation du gate dans le reçu ; il ne constitue pas
  une signature ni une preuve externe.

## Alternatives écartées

- Qualifier toute une topologie en bloc : rejeté, car les états et restaurateurs
  peuvent différer entre variants.
- Accepter `verified` sans preuve liée : rejeté, car une étiquette n'est pas une
  observation indépendante.
- Inclure le bénéfice empirique dans le gate de sûreté : rejeté ; il conditionne une
  promotion ultérieure, pas la réversibilité technique.
- Promouvoir automatiquement après un commit P1 : rejeté, car un transport réussi
  ne prouve ni la validité de la décision ni son bénéfice.

## Vérifications associées

- `node backend/tests/test_morphogenesis_variant_catalog.js`
- `node backend/tests/test_morphogenesis_p2_admission.js`
- `node backend/tests/test_morphogenesis_p1_transaction.js`
- `python scripts/ci/check_code_quality.py`
