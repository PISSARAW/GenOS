# ADR 0707 — Reçu de vérification régionale Métapopulation

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Métapopulation, clôture, preuve, séparation des responsabilités
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0705](0705-registre-adaptateurs-cloture-topologique.md), [ADR 0173](0173-noyau-routage-et-niveaux-de-verification.md)

## Contexte

Le cycle régional persistait le verdict booléen de son adaptateur et un événement
signé par l'acteur producteur. L'adaptateur de clôture pouvait alors utiliser cet
acteur comme identité de vérificateur. La présence d'un événement prouvait la
persistance du cycle, mais ni l'indépendance du vérificateur ni sa liaison exacte
à la mission, à la Métapopulation, au cycle et au résultat.

## Décision

Le runtime régional peut désormais qualifier le résultat d'un vérificateur qui
déclare une identité et son indépendance. Il émet un reçu
`genos.metapopulation-cycle-verification/v1` seulement si cette identité est
non vide, explicitement indépendante et distincte de l'acteur producteur.

Le reçu lie :

- la mission, la Métapopulation et le numéro de cycle ;
- l'acteur producteur et l'identité du vérificateur ;
- le condensat du résultat d'exécution ;
- le condensat du verdict brut de vérification.

Le reçu et son condensat sont persistés respectivement dans l'état canonique du
cycle et dans le journal régional, dans la même transaction. L'adaptateur de
clôture recalcule tous les condensats, vérifie la portée et exige que le journal
désigne le même producteur. Un cycle historique ou externe sans reçu reste
exécutable mais n'est pas admissible à une clôture vérifiée.

## Conséquences

### Positives

- L'acteur qui produit le cycle ne peut plus être promu implicitement en oracle.
- Une altération de portée, de résultat ou d'un seul des deux supports durables
  fait échouer la clôture.
- Les cycles existants restent lisibles et échouent de façon explicite et fermée.

### Négatives

- Les adaptateurs régionaux externes doivent fournir `verifierId` et
  `independent: true` pour rendre leur cycle admissible à une clôture de mission.
- Le reçu est un engagement par condensat et séparation d'identités, pas une
  signature cryptographique d'une autorité externe.

## Alternatives

- **Réutiliser `event.actor`** : rejeté, car il s'agit de l'acteur producteur.
- **Ajouter une table dédiée** : différé ; l'état de cycle et le journal offrent
  déjà une transaction atomique et deux représentations croisées.
- **Accepter le booléen `valid` seul** : rejeté, car il ne porte aucune identité
  ni liaison vérifiable au résultat.
