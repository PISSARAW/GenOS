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

Le vérificateur métier ne déclare plus lui-même son identité ni son
indépendance. Après son verdict, le runtime normalise l'identité du producteur
et confie l'attestation à l'autorité de signature interne, qualifiée par le
registre de vérificateurs sous le type `native_oracle_quality`. L'identité canonique de cette autorité est
`metapopulation-regional-effect-verifier`. Une collision, y compris par casse,
Unicode ou espaces, ferme le cycle.

Le reçu lie :

- la mission, la Métapopulation et le numéro de cycle ;
- l'acteur producteur et l'identité du vérificateur ;
- le condensat du résultat d'exécution ;
- le condensat du verdict brut de vérification ;
- la révision et le condensat de l'état régional canonique vérifié ;
- un reçu HMAC ou Ed25519 de l'autorité de signature existante.

Le runtime capture l'état après exécution et avant vérification. Dans la
transaction de persistance, il recalcule cet état et refuse l'écriture si sa
révision ou son condensat a changé. Le reçu signé, l'état du cycle et le journal
régional sont ensuite persistés dans cette même transaction. L'adaptateur de
clôture vérifie la signature, la portée, tous les condensats et l'identité du
producteur dans le journal. Un cycle historique ou externe sans reçu reste
lisible mais n'est pas admissible à une clôture vérifiée.

## Conséquences

### Positives

- L'acteur qui produit le cycle ne peut plus être promu implicitement en oracle.
- Une identité inventée ou auto-déclarée par l'adaptateur est rejetée.
- Une mutation concurrente ou une réécriture sans incrément de révision est
  détectée avant la persistance du verdict.
- Une altération de portée, de résultat ou d'un seul des deux supports durables
  fait échouer la clôture.
- Les cycles existants restent lisibles et échouent de façon explicite et fermée.

### Négatives

- En production, une clé `GENOS_AGENT_GIT_SIGNING_SECRET` ou
  `GENOS_GRPC_SHARED_SECRET`, ou une paire Ed25519, doit être configurée.
- Les adaptateurs externes ne peuvent plus fournir `verifierId`, `independent`
  ou un reçu d'autorité : ces champs sont réservés au runtime.

## Alternatives

- **Réutiliser `event.actor`** : rejeté, car il s'agit de l'acteur producteur.
- **Faire confiance à un digest public** : rejeté, car un attaquant peut
  réécrire le contenu et recalculer le digest.
- **Ajouter une table dédiée** : différé ; l'état de cycle et le journal offrent
  déjà une transaction atomique et deux représentations croisées.
- **Accepter le booléen `valid` seul** : rejeté, car il ne porte aucune identité
  ni liaison vérifiable au résultat.
