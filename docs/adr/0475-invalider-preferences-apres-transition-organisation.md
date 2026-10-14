# ADR 0475 — Invalider les préférences après transition d'organisation

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Orchestration dynamique, sélection des survivants.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0473, préflight partagé des missions Ontogenesis.

## Contexte

Le runtime de topologie met en cache les identifiants de survivants préférés
par orchestrateur. Une transition d'organisation incrémente sa version et
remplace la politique active, mais ce cache restait lisible jusqu'au prochain
pas de topologie. Un tour de workers pouvait donc être sélectionné par
l'algorithme de l'organisation précédente.

## Décision

Déplacer ce cache dans le module partagé
`swarmTopologyPreferenceStore`. Après le commit réussi d'un changement réel
d'organisation, `dynamicOrganizationService` invalide les préférences de
l'orchestrateur concerné. Un changement refusé ou annulé garde les préférences
actuelles ; une confirmation de la même organisation ne crée pas de transition
et ne purge pas le cache.

Le magasin partagé évite une dépendance de `dynamicOrganizationService` vers
le runtime qui l'importe déjà. La correction n'affirme pas que les préférences
sont partagées entre plusieurs processus : elles restent locales au processus
qui calcule les pas de topologie.

## Alternatives

- Attendre le prochain pas de topologie : rejeté, l'ancien classement peut
  influencer les tours démarrés avant ce pas.
- Invalider avant la transaction : rejeté, une transition refusée perdrait
  les préférences encore valides.
- Faire importer le runtime par le service d'organisation : rejeté, cela
  introduirait une dépendance inverse et un cycle entre services.

## Conséquences

- Les tours de continuation ne réutilisent pas un classement d'une ancienne
  organisation après le commit d'une transition.
- Un test d'intégration vérifie une lecture immédiate après transition et
  confirme qu'un changement rejeté conserve le cache précédent.
- L'invalidation reste bornée au cache local du processus ; une architecture
  multi-instance nécessiterait une invalidation distribuée ou un cache versionné.
