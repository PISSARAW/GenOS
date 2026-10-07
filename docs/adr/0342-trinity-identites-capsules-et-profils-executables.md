# ADR 0342 — Trinity : identités, capsules et profils exécutables

- **Date** : 2026-10-06
- **Statut** : Accepté
- **Domaine** : Trinity, bootstrap, isolation, provenance, workers

## Contexte

Le lot L1 établit contrats et traces. L'audit historique distingue des refus
d'assignation, des chemins de capsule incohérents, des parents de snapshots
absents et des profils inadaptés. `BIOLOGICAL_WORKER_MISSION_AMBIGUOUS` regroupait
absence et pluralité. Le caller du bootstrap ne transmettait pas le `missionId`
à la création du run. Une identité scientifique, une recette déclarée et un
WorkerKind ne sont pas interchangeables.

La campagne s'arrête aussi avant comparaison : l'absence de modèle réellement
observé ne peut pas être réparée par une copie du modèle demandé. Les corrections
ne doivent pas lever les gates de preuve, modifier la clôture en réussite ni
abaisser le seuil de diversité.

## Décision

1. Résoudre les assignations biologiques à partir de l'identifiant explicitement
   transmis, du worker et des missions actives. Refuser séparément zéro ou
   plusieurs candidats. Contrôler les tenants du worker, de l'orchestrateur de
   mission et du parent depuis leurs workspaces persistés. Un agent connu sans
   workspace représente un tenant nul ; une référence pendante représente une
   erreur, conformément à l'ADR 0332 de délégation Trinity.
2. Après rollback, persister un diagnostic d'assignation uniquement pour une
   erreur émise par ce résolveur, sur la même base et pour le même worker. Conserver
   le refus d'origine si cette persistance échoue. Ne copier aucun prompt.
3. Créer le run avant de provisionner la capsule Trinity afin d'utiliser son
   véritable identifiant. Dériver le chemin de capsule de la corrélation
   mission/monde/worker/run ; sceller les fichiers et ancrer leur empreinte dans
   SQLite. La reprise vérifie les paramètres, les fichiers et l'ancre. Les
   capsules partielles exigent une récupération explicite.
4. Passer le root isolé aux processus Rust de bootstrap, vérifier le résultat
   réellement persisté et distinguer les modes `native` et `synthetic`. Un fallback
   ne devient aucune preuve d'exécution native. Le prompt reçoit les identifiants
   et chemins existants, sans suffixe temporel inventé.
5. Initialiser le root avant `mkdtemp` et vérifier exhaustivement les snapshots
   dédupliqués : forme du manifeste, empreintes, tailles, entrées, absence d'extras
   et de liens/jonctions. Les contrôles de confinement existants restent actifs.
6. Prévalider les profils avant création des mondes : rôle, WorkerKind enregistré,
   capacités, recette, outils calculés par monde et paramètres des méthodes
   natives. Corriger les missions techniques mal classées comme littérature,
   conserver la fiction, attribuer un falsificateur au troisième monde hétérogène,
   et rendre les traitements factoriels cohérents avec leurs recettes et routes.
   Le seuil hétérogène reste **0,35**. Les aliases d'une même route ne constituent
   pas deux traitements de modèle.
7. Préserver la stratégie Trinity demandée lors de l'ajout d'un phénotype.
   Conserver les profils dans le design scellé ; leur runtime observé reste
   inconnu tant qu'une observation appropriée manque.
8. Ajouter une observation du lanceur : fichiers hachés avant invocation,
   répertoire, arguments hachés et PID. La lier au manifeste et à l'ancre de capsule
   avant d'envoyer la mission au processus. Refuser une corrélation modifiée.
   L'observation ne renseigne ni provider ni modèle par inférence.
9. Extraire la construction de l'enveloppe de mission en un service avec les mêmes
   valeurs de champs, pour maintenir la limite de complexité du superviseur.

## Conséquences

Les contrôles de lancement et de reprise deviennent testables indépendamment
des réponses générées. Les refus restent des refus et les traces historiques
restent inchangées. L'observation des fichiers avant invocation ne prouve pas
l'identité de toutes les dépendances chargées ni celle du modèle d'inférence.

Les opérations filesystem ne fournissent pas une protection atomique complète
contre un adversaire modifiant les chemins entre vérification et utilisation.
Une capsule sans DB exige une ancre conservée extérieurement. Le bootstrap peut
créer un run avant un refus de capsule : sa clôture cohérente et idempotente reste
une exigence de L3, sans attribution d'une réussite locale au run.

Les voies SHEV, AGOW, AEIS, G-CIR, NSE, GVX, Play/culture/POET et les promotions
conservent leurs exigences des lots suivants. La prévalidation ne remplace pas
leurs reçus d'exécution ni une validation scientifique des 48 missions.

## Alternatives

- Choisir arbitrairement la première mission active : rejeté, car cela change
  l'assignation demandée et peut attribuer les reçus à une autre mission.
- Réutiliser une capsule en vérifiant seulement son nom : rejeté, car le contenu
  et la corrélation peuvent avoir changé.
- Abaisser le seuil de diversité ou inventer des routes observées : rejeté.
- Réécrire les résultats historiques avec les nouveaux contrôles : rejeté ; une
  nouvelle campagne devra produire ses propres preuves.

Validation détaillée : [rapport du lot 2](../06-qualite-preuves/lot-2-trinity-identites-capsules-et-profils.md).
