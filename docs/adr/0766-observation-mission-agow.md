# ADR 0766 — Relier une décision AGOW à une mesure de mission

- **Statut** : Accepté pour l'instrumentation locale et le parcours supervisé Node
- **Date** : 2026-11-02
- **Domaine** : AGOW, provenance, mesures et persistance
- **Lié à** : [ADR 0748](0748-agow-viabilite-collective-multiniveau.md)

## Contexte

Le runtime conserve les frames et les reçus de choix de mode. L'ingress reçoit
ensuite des événements de fin et peut créer un nouveau frame à partir de ce résultat.
Attribuer la performance à ce nouveau frame inverserait l'ordre des événements.
Un événement `AGENT_COMPLETED` n'atteste pas la réussite métier.

## Décision

À la création du run, lier explicitement mission, agent, run, candidat sélectionné,
frame réel et reçu de décision antérieur. Vérifier ces références dans les stores
existants et conserver l'autorité du parcours (`agow` ou `historical`).

Stocker le journal dans `adaptive_state`, scope `agow_mission_observations`, clé
agent. Employer la mise à jour optimiste existante pour arbitrer les écritures
concurrentes. Une liaison existante est immuable ; un événement ou une mesure
contradictoire est rejeté. Le plafond de 2 000 entrées bloque les nouvelles liaisons
sans évincer silencieusement une mission en attente.

À l'ingress terminal, observer cette liaison avant d'admettre le candidat outcome.
Les événements de vérification intermédiaire ne clôturent pas l'observation. Le
payload du worker ne déclare jamais la vérification de ses propres mesures.

Seul un callback `missionOutcomeVerifier` enregistré par l'hôte pour la connexion
SQLite et l'agent peut fournir les mesures. Il reçoit des copies de la liaison et
du contenu terminal canonique, un digest d'événement et un signal d'annulation.
La réponse doit correspondre à ces identités et référencer des preuves. L'hôte
porte la responsabilité de l'indépendance, des sources et de la sémantique métier.
Ce raccord ne remplace pas les vérificateurs ni les gates officiels de mission.

L'absence, l'erreur ou l'expiration du vérificateur produit `verification_pending`.
Les dimensions inconnues valent explicitement `null`. `verified` désigne la
vérification des **mesures**, y compris celles d'une tâche échouée. Conserver la
perte prévue, la perte observée et leur différence ; aucune politique, plasticité
ou topologie n'est modifiée, aucune promotion n'est émise.

## Conséquences

- La réouverture de SQLite restaure le journal ; l'hôte réinstalle ses callbacks.
- Les doublons identiques sont idempotents ; les conflits restent visibles.
- Le timeout borne l'attente et refuse les réponses tardives. L'hôte doit annuler
  les effets externes : une fonction JavaScript arbitraire ne peut pas être tuée.
- Un delta de perte n'établit ni calibration statistique ni causalité. Les priors
  AGOW sont heuristiques ; la comparabilité de l'échelle de perte est à qualifier.
- Le démonstrateur utilise une diffusion locale, un worker et un oracle dans deux
  processus distincts. Il ne qualifie pas l'orchestrateur complet, les huit
  topologies, un modèle LLM ou une campagne sur des tâches métier cachées.

## Alternatives

- Déduire une perte nulle de la fin du processus : rejeté, absence de preuve métier.
- Réutiliser le frame produit par l'outcome : rejeté, attribution temporelle invalide.
- Calibrer automatiquement la politique dès la première mesure : différé jusqu'à
  qualification des métriques et des conditions d'exécution.

## Vérification

Voir le [contrat runtime](../03-reference/observation-mission-agow.md) et le
[rapport local](../06-qualite-preuves/observation-mission-agow-2026-11-02.md).
