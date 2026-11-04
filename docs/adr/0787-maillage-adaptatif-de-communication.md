# Maillage adaptatif de communication par mission

**Statut** : Accepté pour le contrôle Node des cycles et checkpoints
**Date** : 2026-11-04
**Domaine** : Communication, connaissance partagée, missions et transport de signaux
**Décideurs** : Mainteneur GenOS, implémentation soumise en revue
**Lié à** : [Écologie communicationnelle](003x-communication-ecology.md), [décision composée](0734-contrat-de-decision-de-communication-composee.md), [contrats de cycle](0747-contrats-assemblage-prompt-et-cycle-communication.md)

## Contexte

GenOS dispose d'un moteur de décision de communication, d'un registre de
connaissance partagée, d'un annuaire d'expertise et du Signal Plane. Ajouter un
autre bus ne résoudrait pas la sélection de destinataires pertinents. Les
expertises peuvent appartenir à des missions ou projets différents ; les liens
sociaux et poids synaptiques n'établissent pas une autorisation d'échange.

La livraison, la compréhension et l'utilité vérifiée d'une action ont des
preuves différentes. Les poids synaptiques et certaines API historiques de
learning acceptent des indications déclaratives. Ils ne peuvent donc pas
constituer un apprentissage d'utilité qualifié du nouveau maillage.

## Décision

Ajouter une couche déterministe de réduction d'audience, commune à `runCycle`
et `evaluateCheckpoint`, après la proposition du moteur et avant l'enveloppe
et le transport. Au checkpoint, les contrôles de topologie, canal et budget
portent sur la décision finale. Aucun LLM n'est appelé pour le routage.

Le graphe est dirigé : chaque proposition contient des arêtes
émetteur → destinataire. Il est recalculé pour chaque décision à partir de
l'appartenance de mission, de l'organisation effective, des relations, de
l'expertise et du registre Common Ground. Aucun nouveau transport, aucun
nouveau type d'organisation et aucun poids appris ne sont introduits.

### Admission avant classement

- `intent.missionId` identifie une mission persistée. L'émetteur, le propriétaire
  orchestrateur et les destinataires doivent y être attachés explicitement.
- L'organisation et le projet viennent des workspaces persistés. Un périmètre
  déclaré contradictoire est refusé.
- Cette version couvre l'orchestrateur propriétaire et ses enfants directs.
  Elle refuse une arête hors de ce groupe, même dans le même projet.
- Le routage institutionnel et son autorité restent applicables. Les pairs
  isolés, scellés ou anonymes ne deviennent pas voisins par leur score.
- Les profils relationnels continuent de filtrer divulgation et indépendance.
  Les contraintes de communication persistées de la topologie sont réévaluées.

Une liste vide ne devient jamais une diffusion implicite. Un contexte manquant
ou invalide produit un refus observable en mode actif.

### Réduction facultative et obligations

Les signaux informatifs de faible risque, sans destinataire explicite et sans
contenu opaque sont éligibles. Un score déterministe réutilise les coefficients
de l'annuaire d'expertise ; le nombre de références inconnues puis l'identifiant
départagent les égalités. Le degré sortant facultatif vaut trois par défaut et
est configurable entre un et huit.

Les références déjà `grounded` et non expirées sont retirées par couple et
domaine. L'union des références encore inconnues des destinataires retenus est
utilisée pour le payload et l'enveloppe. Les références doivent identifier des
versions immuables ; révocation, contradiction et expiration rendent à nouveau
la référence transmissible.

Les destinataires explicites, actions, avertissements, rétractations,
invalidations, indépendance requise, quorums et communications de risque élevé
ne subissent pas cette limite facultative. Leurs références sont conservées.
Une liste obligatoire comportant un destinataire inadmissible est refusée
entièrement avec un motif, jamais livrée partiellement sous un succès apparent.
La capacité maximale d'entrée est de cent destinataires.

Le niveau de grounding ne diminue jamais. Si le filtrage relationnel exige un
niveau plus fort, son coût estimé supplémentaire est ajouté. Les autres coûts
restent ceux de la proposition initiale : aucune économie réelle n'est déduite
du nombre d'arêtes supprimées.

### Déploiement et audit

`GENOS_COMMUNICATION_MESH_MODE` accepte `off`, `shadow`, `active` ; `shadow`
est le défaut. Les options d'un cycle peuvent sélectionner le mode et le
degré maximal. Le mode shadow conserve exactement l'audience et les références
livrées par la politique existante ; il ajoute seulement sa proposition au
reçu de décision.

Le contrat `genos.adaptive-communication-mesh/v1` figure dans
`decision.meta.adaptiveMesh` : périmètre, version de l'organisation, arêtes,
exclusions motivées, références proposées et compteurs. L'adaptation est
qualifiée `context_adaptive`, le learning `none` et
`tokenSavingsVerified: false`.

Juste avant une livraison active, l'appartenance, la version de l'organisation,
le périmètre et les contraintes relationnelles sont relus. Une modification
incompatible bloque l'émission, sans sélectionner silencieusement une autre
audience. Le périmètre est porté par l'enveloppe ; le payload scellé contient
l'identité de mission et la provenance du plan.
Les empreintes de l'intention structurelle et du plan empêchent leur réemploi
accidentel avec un autre émetteur, domaine, niveau de grounding ou encodage.
Ces empreintes ne sont pas des signatures d'autorité.

## Conséquences

### Positives

- Audience facultative bornée, décisions explicables, même intégration pour
  cycles et checkpoints.
- Cloisonnement de mission et institutionnel avant le classement.
- Cohérence entre destinataires finaux, références, enveloppe et reçus natifs.
- Retour immédiat au comportement initial avec `off`.
- Correction du domaine perdu dans le sélecteur d'audience et du grounding
  omis lors de la finalisation d'une décision.

### Limites

- La réduction suit le calcul initial d'utilité. Elle ne réactive pas une
  décision que ce calcul a déjà mise au silence.
- Common Ground décrit un registre acquis au runtime, sans prouver que le
  contenu est encore présent dans la session d'un modèle. Les scores
  d'expertise sont des indices de classement, pas une preuve d'autorité ou
  d'utilité indépendante.
- Les appels directs au Signal Plane et les autres façades ne passent pas
  automatiquement par cette couche. STIGMERGY et SILENCE ne sont pas reroutés.
- Cette version ne fournit ni maillage multi-machine, ni apprentissage de
  poids, ni recherche de routes multi-sauts. Le TTL, les reçus et l'idempotence
  continuent d'appartenir au transport existant.
- L'audit retourné suit la persistance du reçu de son appelant. Il ne crée pas
  de nouveau journal durable global du graphe.
- L'admission et sa revalidation sont des observations successives de la base,
  sans transaction commune avec un transport arbitraire. Elles ne garantissent
  pas l'atomicité face à une modification exactement pendant la publication.
- La qualité métier et l'économie totale de tokens exigent une campagne
  appariée avec les reçus de tous les appels modèles et un vérificateur externe.

## Alternatives

- Bus parallèle : rejeté, car il dupliquerait la livraison sans résoudre
  l'admission ni la pertinence des destinataires.
- Graphe dense permanent : rejeté, à cause du fanout inutile et des contraintes
  d'indépendance.
- Renforcement sur publication ou ACK : rejeté, ces événements ne prouvent
  pas une action utile vérifiée.
- Remplacer le coordinateur de l'ADR 0747 dans ce changement : reporté, son
  contrat couvre également les prompts, encodages et adaptateurs non concernés.

## Validation

`npm --prefix backend run test:communication-mesh` couvre le domaine de
connaissance, le planificateur sur SQLite réel et une livraison Signal Plane
native. Ces tests sont aussi inscrits dans le profil `signalPlane`.

Voir le [guide du maillage](../02-orchestration/maillage-adaptatif-communication.md)
pour le contrat d'activation et les limites opérationnelles.
