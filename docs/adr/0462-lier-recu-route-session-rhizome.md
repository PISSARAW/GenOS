# 0462 — Lier les reçus de route Rhizome à leur session

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Rhizome, preuves, isolation des missions

## Contexte

Le reçu de route signé liait le chemin, le besoin, le verdict et la sortie, mais
pas la session. Deux sessions avec le même graphe pouvaient accepter le même
reçu et promouvoir dans la seconde une exécution réalisée dans la première.
Un test de falsification a obtenu cet enregistrement avant correction.

## Décision

Le vérificateur reçoit l'identifiant de session et le RouteOutcome doit le
porter. Le condensat signé utilise le domaine `RhizomeRouteOutcome/v2` et
inclut cet identifiant. À l'enregistrement et à la lecture des métriques,
l'identifiant du reçu doit correspondre à la session courante. Un reçu sans
liaison ou issu d'une autre session est refusé.
La création attribue un identifiant aléatoire par le runtime et refuse un
`rhizomeId` fourni par l'appelant : l'ancienne possibilité de réutiliser
volontairement un identifiant après fermeture annulait la liaison du reçu.

## Conséquences

Les anciens reçus restent conservés comme historique, mais ne constituent plus
une preuve admissible pour la complétion ou l'apprentissage. Leur réémission
demande une nouvelle exécution et une vérification indépendante. Le nonce reste
un contrôle d'idempotence au sein de la session ; il ne remplace pas la liaison
cryptographique à la session.
