# ADR 0298 — Cycle de vie des reçus et assemblées AEIS

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : AEIS, signature, rétention, audit
- **Lié à** : ADR 0233, ADR 0294

## Contexte

Les assemblées et les reçus dépendaient d'une seule clé HMAC sans identifiant de version.
Changer le secret rendait les anciens enregistrements illisibles. Les assemblées n'avaient
ni date de création ni politique de rétention ; la table était créée à la volée.

## Décision

Les nouveaux reçus signent un identifiant de clé et les nouvelles assemblées stockent cet
identifiant, une version de signature et leur date. Les anciennes signatures restent
lisibles avec la clé `legacy`. Le secret actif est fourni par
`GENOS_EPISTEMIC_RECEIPT_SECRET`, son identifiant par
`GENOS_EPISTEMIC_RECEIPT_KEY_ID`, et les anciens secrets par l'objet JSON
`GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS`. Une migration ajoute les colonnes aux bases
existantes. La rétention des assemblées est limitée à 90 jours et 10 000 lignes par
défaut. Le manifeste de vérificateur couvre aussi les nouveaux modules qui participent
au contrat de preuve.

## Conséquences

- Positives : rotation sans invalider l'historique encore retenu, volume borné, contrôle
  d'intégrité après redémarrage.
- Négatives : les clés précédentes doivent rester disponibles pendant la période de
  rétention ; retirer une clé plus tôt rend ses assemblées illisibles.

## Alternatives

Réutiliser une clé sans version n'aurait pas permis d'identifier correctement la clé
historique. Garder tous les assemblages sans expiration aurait augmenté indéfiniment le
coût de stockage et d'audit.
