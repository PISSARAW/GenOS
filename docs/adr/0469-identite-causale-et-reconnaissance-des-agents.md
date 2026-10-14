# ADR 0469 — Identité causale et reconnaissance des agents

**Statut** : Accepté
**Date** : 2026-10-14
**Domaine** : Identité, continuité, mémoire, relations

## Problème

Le dossier introduit par l'ADR 0441 regroupait quatorze dimensions, mais son
empreinte ne prouvait pas une continuité. Une ligne d'agent suffisait à rendre
`continuity` connue. Deux processus pouvaient reprendre le même individu et
une déclaration d'émetteur ne constituait pas une authentification.

## Décision

Un `agentId` désigne un individu dans une portée enregistrée. Une incarnation
désigne une activation bornée par un bail, un jeton de clôture croissant et
une preuve secrète conservée par le runtime. Les secrets ne sont pas exposés
dans les vues des daemons, les contextes cognitifs publiés ou les reçus modèle.
Un nom, un modèle, un rôle et un processus ne définissent pas à eux seuls
l'individu. L'identité ne confère pas de permission.

La migration 118 capture les insertions ultérieures dans `agents` et
`daemon_runtime_state`. Les lignes antérieures reçoivent `LEGACY_IMPORT`,
jamais une genèse historique inventée. Des déclencheurs capturent les
changements de nom, rôle, modèle, statut, parent, workspace et santé ; ils sont
consommés transactionnellement par le registre causal.

Le registre conserve des événements immuables au niveau de l'API SQLite,
une tête avec révision, une chaîne locale et des références causales vers
d'autres événements de la même portée. La canonicalisation des objets rend
les empreintes indépendantes de l'ordre des propriétés. Les écritures utilisent
une comparaison de révision et une clé d'idempotence liée au contenu.
Le dossier demeure une projection ; `declaredLineage` reste distinct de la
continuité vérifiée depuis la genèse ou l'import.

Une identité terminée ne redevient pas active par une simple modification de
statut. Les identifiants supprimés ne sont pas réutilisables. Un remplacement
SQL d'une inscription ayant une identité invalide son activation. La restauration
contrôlée peut réouvrir une trajectoire sans effacer son histoire.

## Frontières branchées

- `AgentSelf` construit sa vue SQL sous transaction et expose le modèle de soi
  ainsi que les modèles locaux des pairs pertinents ; `WorkerSelf` et
  `AgentExpressionContext` transportent ces références.
- La génération locale prend une incarnation, enregistre la décision et son
  résultat à la barrière de preuves, puis libère l'incarnation. Le reçu est
  attaché à l'événement de complétion sans modifier le rapport vérifié.
- `modelRouter` vérifie l'incarnation des appels attribués à un agent enregistré.
  Les appels de services sans individu enregistré restent des appels de services.
  L'incertitude issue d'au moins trois résultats du domaine alimente le plan
  cognitif lorsqu'il est compilé pour la requête.
- Les daemons renouvellent leur bail au heartbeat. Une vue SQLite sans possession
  de l'incarnation ne donne pas le droit d'exécuter un cycle. L'arrêt normal
  libère l'incarnation ; après crash, une reprise concurrente attend le bail.
- Les captures ancrent leur hash et les composants couverts dans le registre.
  Le fork scellé crée un nouvel individu avec une origine causale ; un ancien
  snapshot ancré lors de l'admission est marqué `legacy_admission`.
- Une restauration ajoute `RESTORE`, conserve les événements intermédiaires,
  invalide l'ancienne incarnation et ne prétend pas annuler les effets externes.
- L'admission RPE autorisée vérifie les identités de la portée et garde un reçu
  de rencontre. Ce contrôle s'ajoute au grant, sans le remplacer.

## Soi, autrui et expérience

Le modèle de soi sépare la fréquence des résultats et leur calibration du récit
de l'agent. Un résultat attribué à un pair, au groupe ou inconnu n'est pas crédité
comme une compétence individuelle. Un résultat de génération locale atteste
l'admission par sa barrière de preuves, pas une vérité universelle sur la tâche.
Un simple succès de transport modèle n'est pas inscrit comme réussite de tâche.

Les modèles d'autrui sont locaux à chaque observateur : données du registre,
déclarations, observations et inférences restent des sources séparées. Les
présentations portent une audience, une portée, une expiration et une signature
HMAC du runtime ; leur nonce ne peut produire deux rencontres différentes.
La réutilisation idempotente d'une même opération rend le même reçu.
Une présentation externe exige une incarnation active et sa preuve ; la voie
interne RPE s'appuie sur son autorisation déjà vérifiée et se qualifie comme
route vers un pair enregistré, sans prétendre prouver un processus distant.

Les épisodes hérités gardent leur auteur initial, y compris après plusieurs
transferts. Ils sont distingués dans la projection autobiographique et le rappel,
et exclus de la consolidation des leçons personnelles. Les anciens épisodes
sans provenance restent `legacy_report`. Les nouveaux épisodes non reliés à
une décision demeurent `reported`. Les contextes de soi ne récitent pas le
journal complet et les mémoires des pairs ne sont pas diffusées globalement.

## Limites explicites

Le périmètre de confiance est le runtime et sa base. Une empreinte démontre
l'intégrité des contenus disponibles, pas leur vérité ; un administrateur qui
contrôle la base et les clés reste hors de cette frontière. Les appels natifs
qui contournent `modelRouter`, les communications qui contournent RPE et les
magasins externes non couverts par un checkpoint ne sont pas attestés par ces
seules intégrations. Les primitives exposées restent internes au runtime ; aucun
outil ne permet à un modèle de s'auto-attribuer une identité ou une autorité.

Les modèles sociaux et la calibration sont des mécanismes fonctionnels. Ils
ne prouvent ni expérience subjective humaine, ni personnalité juridique, ni
une résolution métaphysique du problème d'identité. Les scissions symétriques
et fusions d'individus doivent utiliser des naissances et des terminaisons
explicites ; cette version ne crée pas une opération autonome de fusion de soi.

## Vérification

`npm --prefix backend run test:identity` couvre genèse/import, mutations,
concurrence, historique immuable, baux, preuve d'incarnation, usurpation,
rejeu de présentation, séparation des sources, modèles locaux, effet de la
calibration sur le plan cognitif, fork, restauration et mémoire héritée.
Les suites daemon, workers, orchestrateur, RPE, fork et restauration vérifient
les points de branchement. Les tests unitaires de snapshot à faux stockage
isolent cet adaptateur ; les tests SQLite exercent les contrats identitaires.
