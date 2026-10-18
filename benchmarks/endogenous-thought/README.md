# Endogenous Thought Test — ETT v1

- **Statut** : protocole, contrats et persistance implémentés ; campagne non exécutée
- **Portée** : simulation déterministe en lecture seule
- **Dernière revue** : 2026-10-18

ETT v1 mesure si une boucle GenOS peut détecter une anomalie, formuler une
question falsifiable, arbitrer une recherche bornée, vérifier son résultat et
s'arrêter sans nouvelle requête humaine après le lancement. Il ne mesure pas
la conscience phénoménale.

Le protocole préenregistré se trouve dans
[`protocol-v1.json`](protocol-v1.json). Les métriques canoniques sont définies
dans [`../../shared/endogenousThoughtMetrics.v1.json`](../../shared/endogenousThoughtMetrics.v1.json).

Le contrat peut être vérifié depuis la racine du dépôt avec :

```powershell
npm --prefix backend run test:ett
```
Le payload d'une transition d'épisode est défini par
[`../../spec/cognitive-episode.schema.json`](../../spec/cognitive-episode.schema.json).

## État de PR2

PR1 a figé les frontières, contrats et métriques. PR2 ajoute :

- un identifiant de transition idempotent dans le contrat canonique ;
- un journal SQLite append-only de reçus et de questions ;
- une tête d'épisode mise à jour par comparaison de version et de lignée ;
- la reprise vérifiée après fermeture et réouverture de la base ;
- l'isolation par organisation et projet.

Le détecteur endogène, le raccord SHEV/AGOW/Ontogenèse, le runner et la
campagne réservée appartiennent aux tranches suivantes. La persistance seule
ne vaut donc ni exécution ETT ni validation d'une capacité cognitive générale.

## Frontières de sécurité

Les ablations expérimentales ne retirent jamais l'autorité, le sandbox, les
budgets ni les barrières de preuve. L'ablation SHEV neutralise seulement sa
contribution à la génération d'initiative dans le simulateur.

Une sortie de modèle est une proposition. Seul un vérificateur indépendant
peut la faire compter dans les métriques de découverte ou de correction.
