# ADR 0401 — Preuve de clôture des missions Holobionte

- **Statut** : accepté, portée limitée
- **Date** : 2026-10-11
- **Décideurs** : équipe GenOS
- **Domaine** : verdict métier, cycle de vie Holobionte, snapshot topologique

## Contexte

Le runner des douze variants pouvait annoncer `PASS` après un refus métier,
par exemple `planPlacement` avec `accepted:false`, si un vérificateur de
mission approuvait les références de preuve. Une mission réussie laissait
aussi sa session `ACTIVE`, alors que le snapshot Holobionte exige une session
`QUIESCENT` ou `CLOSED` et une identité de workspace persistée.

## Décision

Le verdict du runner contrôle les résultats métier des opérations qui portent
un champ de succès explicite. Un refus produit `FAIL` et identifie les
opérations concernées, même si le vérificateur de mission a répondu `PASS`.

Une session ne passe à l'arrêt que si la mission a le verdict `PASS`, que le
host est lié à l'agent et au workspace persistés, et qu'un vérificateur
indépendant fournit un reçu `VERIFIED`. Le reçu lie la mission, le Holobionte,
le SHA-256 du workflow exécuté, l'immunité des sorties et des références de
preuve de la mission. Le vérificateur ne peut pas être le host. Le service
d'arrêt existant vérifie la révision et applique `QUIESCENT` pour un host
persistant ou `CLOSED` pour une mission ponctuelle. Son événement conserve le
reçu. En absence de ces conditions, la session demeure `ACTIVE` et le
résultat expose le motif du blocage.

## Conséquences et limites

Le snapshot topologique peut capturer une mission arrêtée avec preuve et
identité vérifiées. Les anciens appels sans `verifyLifecycleEvidence` peuvent
encore produire un verdict de mission, mais ne prétendent pas que la session
est arrêtée. Le reçu fourni par le callback reste une attestation de ce
vérificateur ; cette décision ne prouve ni l'état externe distant ni une
restauration globale atomique.
