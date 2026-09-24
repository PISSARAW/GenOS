# ADR 0056 — Contribution vérifiée et ledger symbiotique Holobionte

## Statut

Accepté — septième tranche de fondation Holobionte.

## Contexte

L'admission prouve qu'un candidat a réussi un essai limité ; elle ne mesure pas
la valeur de ses contributions au fil du temps. La résidence doit pouvoir être
évaluée à partir des bénéfices, coûts, risques et interventions réellement
observés.

## Décision

1. N'enregistrer une contribution que pour un résident avec contrat actif et
   capacité correspondante.
2. Exiger une attestation `VERIFIED`, un vérificateur identifié, un hash de
   résultat et des preuves qui couvrent les exigences du contrat.
3. Calculer la contribution comme le produit du bénéfice normalisé et de la
   qualité des preuves ; conserver séparément coûts, risques, ressources
   consommées, échecs, fausses alertes et interventions du Host.
4. Ajouter à la fois un événement `CONTRIBUTION_VERIFIED` et une ligne dans le
   ledger append-only dans la même transaction.
5. Dériver une classification de relation à partir des observations agrégées ;
   la classification est descriptive et ne remplace pas une décision immune.

## Conséquences

- Les contributions et leur provenance sont auditables et alimentent le plan
  de ressources.
- L'attestation provient du gate appelant ; l'authentification cryptographique
  du vérificateur et l'évaluation automatique des résultats restent à intégrer.
- Les indicateurs sont normalisés à l'entrée ; les benchmarks longitudinaux
  restent nécessaires pour calibrer les seuils.

## Alternatives

- Déduire la valeur du simple fait qu'un résultat a été accepté : rejeté, car
  cela confond sortie produite et bénéfice vérifié.
- Modifier une ligne existante pour corriger une mesure : rejeté, car l'historique
  de la relation doit rester append-only.
