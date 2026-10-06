# ADR 0329 - Traces OpenTelemetry après persistance

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : observabilité, télémétrie, confidentialité
- **Décideurs** : équipe GenOS
- **Lié à** : [Reçus d'exécution](0178-recus-biologiques-et-autorite-homeostatique.md)

## Contexte

Les événements et reçus GenOS sont persistés, mais leur suivi entre missions,
workers, coûts et rapports d'évidence demande une vue opérationnelle commune.
Une exportation de l'événement brut exposerait prompts, résultats d'outils ou
secrets. La disponibilité d'un collecteur ne doit pas changer le verdict de
persistance.

## Décision

Après la réussite de la persistance d'un événement, un pont facultatif crée
un span OpenTelemetry pour une liste fermée de types d'événements. Il exporte
seulement des identifiants hachés, des états énumérés et des compteurs
numériques bornés. Le contenu de l'événement, son détail, les prompts et les
reçus ne sont pas copiés. Un sel stable configuré permet de corréler plusieurs
processus ; sans lui, le sel est local au processus.

L'export OTLP/HTTP n'est activé que si GENOS_OTLP_TRACES_ENDPOINT est défini.
L'URL doit être HTTPS ou HTTP local et se terminer par /v1/traces. Une erreur
d'export n'annule pas l'événement déjà persisté. Une configuration
Collector contrib ajoute un processeur de redaction à liste d'attributs
autorisés avant la sortie debug locale.

Les spans sont une aide d'observation. Seules les tables d'événements, les
reçus et les gates de preuve décident de la validité d'une mission.

## Conséquences

### Positives

- Les étapes autorisées partagent un condensat de session et d'agent pour
  faciliter la corrélation sans exporter les identifiants bruts.
- Les pannes du collecteur ne changent pas la persistance GenOS.
- L'exporteur est testé contre un récepteur OTLP/HTTP local.

### Négatives

- Les packages OpenTelemetry JavaScript deviennent des dépendances backend.
- Le collecteur de démonstration exige la distribution contrib pour le
  processeur de redaction.
- Cette vue ne reconstitue pas tous les liens parent-enfant d'une trace
  distribuée ni la preuve métier associée aux reçus.

## Alternatives

- Exporter les événements JSON complets : exposition inutile de données.
- Utiliser les traces comme preuve de réussite : le transport d'un span ne
  démontre pas l'effet observé.