# ADR 0272 — Dispatch runtime du cycle développemental GVX

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : GVX, runtime AGOW, expérimentation et plasticité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0030, ADR 0270

## Contexte

AGOW persistait les signaux développementaux et `gvxDevelopmentController.runCycle`
existait, mais aucun chemin runtime n'appelait le cycle et aucun contrat ne distribuait
les adapters propres au substrat. Exécuter des callbacks reçus dans une mission ou
fabriquer des adapters génériques aurait permis au code évalué de dicter ses propres
conditions et mesures.

## Décision

Un signal AGOW inédit dont l'action recommande une hypothèse ou une expérience est
dispatché vers `runCycle` uniquement si un module d'adapters local, statique et épinglé
par SHA-256 est configuré. Le module expose `createAdapters({ db, signal })`. Les
transports de mission ne peuvent pas injecter du code d'adapter. Sans configuration, le
signal reste persisté et le cycle répond `deferred`.

Avant toute émission d'un crédit positif, le control plane distant doit signer les
preuves de métriques exigées par le profil ainsi qu'un `gvx-somatic-assessment-v1`
recalculé. Le reçu de développement doit lier ce reçu d'assessment à sa liste de preuves.
Une retransmission de signal déjà persisté ne relance pas automatiquement le cycle.

## Conséquences

- Le runtime standard possède un chemin d'exécution, mais les adapters de nursery,
  applicabilité somatique, application autorisée et observation longitudinale restent
  propres à l'application.
- Un cycle interrompu n'est pas relancé par la simple retransmission du signal; un
  mécanisme de reprise durable reste nécessaire avant une exécution distribuée.
- Un module de vérification métier doit produire des reçus pour chaque requirement
  `gvx-somatic-metric:<nom>`; l'intégrité d'octets seule ne permet pas de crédit positif.
- L'absence d'un tel module ou d'un jeu holdout maintient les claims d'efficacité à
  `unknown`.

## Alternatives

- Exécuter un cycle pour chaque signal replayé : rejeté, car une panne après une étape
  pourrait dupliquer une proposition ou une expérience.
- Fournir un executor d'expériences générique dans le runtime : rejeté, car les mesures,
  l'environnement et le retour somatique dépendent du domaine de l'application.
