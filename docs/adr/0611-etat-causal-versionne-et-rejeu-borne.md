# ADR 0611 — État causal versionné et rejeu borné

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : état, snapshots, branches, contrefactuels, rejeu
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0604, ADR 0163

## Contexte

GenOS possède plusieurs implémentations spécialisées de snapshots, branches,
forks et rejeux. Elles répondent à leurs domaines respectifs, mais ne forment pas
un contrat causal commun lié à l'autorité d'exécution v2. Un appelant pouvait
donc présenter un état ou un résultat de rejeu sans chaîne canonique unique entre
le run autorisé, l'ancêtre, l'intervention, les transitions et l'état observé.

Le succès d'un rejeu ne constitue par ailleurs ni une preuve indépendante, ni
une autorisation de promotion. Ce lot doit conserver cette séparation.

## Décision

1. Introduire un journal causal append-only par run v2 autorisé. Chaque snapshot
   contient un état JSON canonique, son hash, la transition qui l'a produit, le
   hash de cette transition, son parent et un sceau couvrant tout le tuple.
2. Lier chaque branche et snapshot au hash de l'enveloppe d'autorité d'exécution
   vérifiée. Une enveloppe absente, historique en lecture seule, expirée ou liée
   à un autre agent fait échouer l'opération fermée.
3. Créer les forks comme de nouvelles branches avec un snapshot d'ancrage dont
   le parent est le snapshot source. L'intervention demandée est conservée dans
   la branche et dans la transition de fork, sans modifier l'ancêtre.
4. Avancer une tête de branche par comparaison avec la tête attendue. Deux
   écrivains concurrents ne peuvent donc pas fabriquer silencieusement une
   histoire linéaire commune.
5. Produire les diffs sous forme d'opérations JSON canoniques et rejouer une
   chaîne en suivant les parents, avec une profondeur maximale de 1 000
   snapshots. Chaque état recalculé doit correspondre au hash immuable stocké.
6. Persister un reçu de rejeu `verified` ou `refused`. Ce reçu fixe le chemin,
   les hashes attendu et observé, la cause de refus et l'autorité. Il porte
   toujours `promotionEligible: false`.
7. Interdire les mises à jour et suppressions SQL des snapshots et reçus. La
   quarantaine ou la clôture d'une branche restent des décisions de gouvernance
   distinctes ; ce service ne promeut rien.

## Conséquences

### Positives

- l'état devient versionné et adressable par contenu dans une lignée explicite ;
- branches, forks et diffs partagent le même contrat ;
- un rejeu vérifie effectivement les transitions au lieu de recopier l'état final ;
- les conflits d'écriture sont détectés à la tête de branche ;
- le résultat reste borné et ne peut pas s'auto-promouvoir.

### Négatives

- l'état complet est conservé à chaque snapshot en plus du diff ;
- le contrat ne remplace pas encore les stores spécialisés existants ;
- une migration ultérieure sera nécessaire pour raccorder chaque producteur
  historique au journal commun ;
- la signature cryptographique demeure celle de l'enveloppe GVX d'autorité ; le
  sceau de snapshot est un hash d'intégrité, pas une nouvelle identité de signeur.

## Alternatives rejetées

- **Déduire la lignée des timestamps** : rejeté, car l'ordre temporel n'établit
  ni parenté ni causalité.
- **Ne stocker que les diffs** : rejeté pour ce premier lot, car la récupération
  d'un état deviendrait dépendante de toute la chaîne avant la stabilisation du
  format.
- **Déclarer un rejeu réussi comme promotable** : rejeté, car l'exactitude du
  mécanisme ne prouve pas la vérité de la décision rejouée.
- **Réécrire les snapshots spécialisés** : rejeté, car cela détruirait leur
  provenance et élargirait excessivement le lot.

## Vérifications associées

- `node backend/tests/test_versioned_causal_state.js` ;
- `npm --prefix backend run test:p1-socle` ;
- `python scripts/ci/check_code_quality.py` ;
- `npm test` et `cargo test --workspace` avant promotion du lot complet.
