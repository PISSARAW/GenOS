# Missions LLM parallèles et outils dans Rust

**Statut** : Accepté pour des vagues bornées de tours indépendants  
**Date** : 2026-11-03  
**Domaine** : Runtime Rust, ordonnancement, concurrence, budgets et preuves  
**Lié à** : [Missions multi-agents avec outils](0781-missions-llm-multi-agents-et-outils-rust.md)

## Contexte

Le profil multi-agents natif exécute le DAG dans son ordre déclaré. Le
paralléliser demande de distinguer les dépendances réelles de cet ordre,
de réserver les ressources avant plusieurs HTTP et de fermer chaque vague
avant une nouvelle admission ou une publication.

## Décision

Ajouter `max_parallel_agents`, de valeur implicite un, borné entre un et
quatre et au nombre d'agents admis. Une valeur supérieure à un sélectionne
l'ordonnancement par vagues de tours. Chaque agent a au plus un tour dans
une vague et ses dépendances doivent être terminées. Le dernier agent
reste le puits transitif de tout le DAG.

La sélection respecte l'ordre de configuration et les ressources disponibles.
Les fenêtres temporelles divisent le temps ordinaire disponible entre les
membres retenus, sous leur plafond et le bail. Le quota temporel reste la
somme des durées observées, y compris les attentes du fournisseur ; il
n'est pas remplacé par la seule durée écoulée de la vague.

Une transaction SQLite immédiate prépare les contextes SYNAPSE, toutes les
intentions et expositions modèles, puis l'admission durable de la vague.
Son échec annule toute cette préparation. Une seule vague peut rester
ouverte par incarnation, y compris entre plusieurs processus du CLI.

Des threads bornés exécutent ensuite les tours avec des connexions au journal
distinctes. Le permis modèle reste consommé par un CAS unique avant HTTP.
Les outils gardent leurs permissions et leurs transactions privées. Tous
les threads lancés sont rejoints, même si un membre échoue ou panique.
Aucune vague suivante n'est lancée après cet échec dans l'invocation.

## Sept frontières conservées

- CONTINUITY journalise les vagues et bloque la succession tant qu'une vague
  reste ouverte. Une issue inconnue ne recrée jamais un permis.
- MORPH conserve une identité et des méthodes admises par agent.
- SYNAPSE lie chaque dialogue aux sources, copies reçues et résultats d'outils
  réellement consommés, avec une fenêtre persistée propre au tour.
- ALLOSTASIE réserve atomiquement les coûts globaux, sous la réserve protégée
  existante de cinq pour cent, puis règle les observations réelles.
- OMEGA exige l'appartenance à une vague active avant le dispatch d'un profil
  parallèle et conserve les effets d'outils atomiques et idempotents.
- EVIDENCE vérifie l'association exacte des observations aux vagues closes
  ainsi que le contrat d'artefact et toute la fermeture causale existante.
- GQWF ne reçoit les dépendances qu'après leur complétion et conserve la
  publication finale atomique, sous preuve et tête courante.

Une vague interrompue peut être close au rejeu uniquement lorsque chaque
observation est connue et chaque outil ou complétion de tour effectivement
fermé. La récupération conserve l'historique des arrêts et n'effectue aucun
redispatch d'une observation inconnue.

## Points de livraison

1. Contrat explicite de concurrence et admission des dépendances réelles.
2. Contextes bornés et APIs de réservation dans une transaction commune.
3. Journal durable des vagues, appartenance et unicité d'une vague ouverte.
4. Sélection des tours prêts et préparation atomique de leur admission.
5. Exécution concurrente des inférences et outils, avec jointure complète.
6. Activation dans l'exécuteur Rust et métriques de l'invocation.
7. Preuve des vagues closes et conservation de la publication GQWF.
8. Reprise, inconnus, contention et succession sous les gardes existantes.
9. Qualification CLI par de vraies requêtes HTTP concurrentes et effets CAS.
10. Régressions, contrôles globaux et qualification documentée.

Chaque point reçoit son commit. Les modules suivent leurs dépendances et
sont qualifiés ensemble lorsque le parcours complet est activé.

## Conséquences et limites

Le parallélisme porte sur des tours d'agents logiques du même hôte. Un
fournisseur peut sérialiser le calcul des générations malgré des requêtes
HTTP simultanées. Un DAG en chaîne ou des ressources insuffisantes réduisent
la largeur réelle. Les effets SQLite sont sérialisés par leurs transactions.

Le profil parallèle impose le journal natif confiné du workspace. Les
métriques de threads et de vagues décrivent l'invocation courante ; elles
ne sont pas des attestations de calcul parallèle du modèle. Les cas HTTP
contrôlés et les essais de modèle réel sont rapportés séparément.

L'assurance reste celle du contrat d'artefact. Vérité sémantique, promotion
et autorité d'effets externes restent non établies. La confiance demeure
celle du stockage et du fournisseur de l'opérateur local.

## Alternatives écartées

- Lancer tout le DAG sans vérifier les dépendances ni réserver les ressources.
- Réserver le plafond complet à chaque frère jusqu'à épuiser le même budget.
- Relancer les HTTP inconnus à la reprise ou publier avant la jointure.
- Présenter le nombre de threads comme une preuve du calcul du fournisseur.
