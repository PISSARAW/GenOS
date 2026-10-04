# ADR 0298 — Physiologie relationnelle exécutable

- **Statut** : Proposé, avec noyau intégré et raccord ciblé au routage
- **Date** : 2026-10-04
- **Domaine** : Relations inter-agents, communication, autorité, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [Physiologie relationnelle](../02-orchestration/physiologie-relationnelle.md)

Base auditée : `bcc7a31ea5dcfafcf3357d33993407f30a694570`.

## Contexte

Le registre `agent_relations` conserve 29 types de relations. Le service
`crossAgentRelationalService` persiste des presets ; ces nombres ne sont ni des
mesures d'indépendance ni des capacités de sécurité. `workerContractEnforcement`
porte des contrôles d'autorité distincts. Le routage de communication consomme
déjà les profils relationnels, mais son filtrage par score ne détecte pas à lui
seul une ascendance partagée transitive.

Une parenté, une relation de travail, une capacité déléguée, un partage d'état et
un lien de preuve ne doivent pas être fusionnés en un graphe d'autorité implicite.

## Décision

Ajouter un compilateur déterministe de contraintes, pas un nouvel orchestrateur
ni un LLM résident. Ses données d'entrée sont des projections bornées, scopées,
versionnées et attestées par les services existants. Ses sorties sont : refus ou
éligibilité sous les gates existants, plan réduit, codes de justification et reçu
rejouable. Le moteur ne produit pas d'authentification, de permission ou de preuve
scientifique par sa seule exécution.

L'autorité effective demeure l'intersection des droits autorisés par le runtime,
des plafonds du parent, des baux et des restrictions relationnelles. Une relation
sociale ne peut jamais élargir un ensemble de capacités.

## Conséquences

### Comportement intégré

- Noyau sans dépendance npm, sans appel LLM, sans réseau et sans boucle permanente.
- Validation des types, identités, scopes, versions, intervalles et tailles.
- Intersections de plafonds, interdictions des observateurs, limites de délégation,
  refus d'auto-promotion et tutelle uniquement après admission par l'autorité.
- Projection de références autorisées, masquage des conclusions, déduplication par
  accusés réellement fournis et préservation des événements de contrôle.
- Cohortes de provenance à partir des lignées transitives et des facteurs communs
  déclarés par les collecteurs de provenance attestés ; provenance absente = inconnu.
- Proposition pure de transitions du cycle relationnel et estimation consultative
  de fiabilité par observations uniques, validées et spécifiques au domaine.
- Reçu de décision haché et rejeu exact à entrée identique.
- Patch étroit dans `relationshipCommunicationRoutingService.profileAudience` :
  exclusion des ascendances partagées déclarées, chargées depuis SQLite avec scope
  strict et borne explicite. Ce patch ne certifie pas les candidats restants.

### Limites et coûts

Le paquet ne remplace pas les signatures, le contrôle d'accès, les baux, les
transactions budgétaires ou les barrières d'évidence de GenOS. Il ne fournit pas
le collecteur fédéré de tous les graphes, le contrôleur de clôture des baux en
cours, ni un verrou distribué. Les ports d'hôte requis par `runGuarded` doivent
être raccordés à ces services avant une utilisation en production.

Les huit topologies ne sont pas toutes raccordées. Les transitions et
observations ne sont pas encore persistées automatiquement. Aucune migration
n'est ajoutée. Aucun gain sur des missions réelles ni aucune indépendance
statistique n'est démontré par les tests de ce paquet.

## Contraintes d'intégration

La validation d'une origine doit provenir d'un reçu du runtime vérifié, jamais
d'un booléen fourni par un worker. Les arguments `context` et `authorization`
appartiennent au plan de contrôle de confiance. Ne pas exposer `evaluate` comme
un outil MCP acceptant des autorisations déclarées par son appelant.

`withBoundary` doit sérialiser la révocation et l'admission de dispatch, dédupliquer
les identifiants d'opération et réserver les ressources atomiquement. L'appelant
doit gérer les effets externes déjà commencés, l'annulation, les clés de fencing
et la réconciliation après crash. Un hash de reçu n'est pas une signature.

Les champs transmis à `execute` doivent provenir du plan réduit. Le récupérateur
de contenu doit vérifier les hashes des références et leur ACL avant lecture.
Un arrêt ou une révocation n'est jamais supprimé au seul motif qu'il a déjà été vu.

## Alternatives

**LLM relationnel permanent :** coût, bavardage, non-déterminisme et nouveau juge.

**Droits issus de `manager` ou `friend` :** escalade de privilèges et népotisme.

**Compteur de voix par agent :** double comptage des descendants, clones et
sources partagées.

**Base de données relationnelle parallèle complète :** duplication et divergence.
Le prototype lit la table existante ; les futurs événements doivent prolonger
les autorités canoniques et leurs journaux, pas les remplacer.

## Validation et déploiement

Tests unitaires, SQL réels sur le sous-schéma utilisé, raccord exact du routeur
avec son résolveur de profils simulé, essais du port d'exécution et rejeu.
L'intégration a été précédée d'un dry-run et d'un contrôle du blob Git du routeur
modifié. Elle ne committe, ne pousse et ne fusionne rien.

Avant adoption : exécuter les gates complets de GenOS, tester les scénarios
multi-processus, mesurer le coût du graphe par scope, puis comparer des missions
avec/sans le moteur à modèle, budget, outils, tâches et critères fixés.
