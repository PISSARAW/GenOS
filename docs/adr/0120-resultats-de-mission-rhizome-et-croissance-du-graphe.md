# ADR 0120 — Résultats de mission Rhizome et croissance du graphe

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Rhizome, workers et provenance
- **Décideurs** : GenOS
- **Lié à** : [ADR 0118](0118-preparer-les-workers-et-operer-le-graphe-rhizome.md)

## Contexte

Les missions Rhizome doivent cartographier des capacités, dépendances, contrats
et routes alternatives sans présumer que le graphe initial est complet. Un
accusé d'acceptation du worker ne fournit pas de réponse exploitable et ne doit
pas être présenté comme un résultat. Les propositions de capacités doivent
rester distinguées des éléments vérifiés.

## Décision

Les workers Rhizome reçoivent un contrat de sortie structuré contenant une
réponse, des capacités, dépendances inconnues, interfaces, hypothèses et
références d'évidence. Le contrat de dossier worker et sa provenance restent
obligatoires. Le préfixe textuel `json` est toléré avant un objet JSON afin de
prendre en charge les réponses courantes des modèles locaux.

Le synthétiseur Rhizome collecte uniquement les réponses de workers terminés
avec leur identifiant d'événement d'évidence et leur provenance. Il ajoute les
capacités et dépendances découvertes au graphe avec l'état `DISCOVERED`, et les
relations proposées avec l'état `DORMANT`. Une proposition n'est donc pas
promue en route vérifiée par la seule génération du modèle. Une mission est
complète seulement quand chaque branche attendue a produit un dossier valide;
les résultats partiels restent explicitement partiels.

Le dispatch Rhizome attend séquentiellement la fin runtime de chaque branche
pour éviter la concurrence SQLite observée avec les finales d'événements. La
collecte attend aussi que le PID runtime soit effacé avant de fermer la base.
Biome conserve ses rôles d'adaptation des populations et niches; cette
évolution porte sur les capacités et routes Rhizome.

## Conséquences positives

- Les résultats contiennent des réponses de branches plutôt que des statuts
  d'acceptation seuls.
- Les capacités non cartographiées peuvent étendre le graphe sans fabriquer de
  preuve de validation.
- Les dossiers gardent un lien vérifiable entre réponse, événement et branche.
- Une mission partielle n'est pas annoncée comme complète.

## Conséquences négatives

- Les workers qui ne respectent pas le contrat produisent des missions
  partielles et peuvent déclencher le mécanisme existant de récupération.
- Le dispatch séquentiel augmente la durée totale des missions.
- La qualité de la cartographie dépend encore de la précision des réponses du
  modèle et nécessite une validation avant activation des routes.

## Alternatives

- Accepter les résumés libres, au prix d'une extraction de graphe instable et
  d'une provenance moins vérifiable.
- Promouvoir immédiatement les routes proposées, ce qui confondrait hypothèse
  et évidence.
- Maintenir un coordinateur central comme source unique de la topologie, ce qui
  contredirait l'exploration distribuée demandée.
