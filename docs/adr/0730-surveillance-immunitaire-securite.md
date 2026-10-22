# ADR 0730 — Surveillance immunitaire de sécurité pilotée par adaptateurs

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : sécurité, immunité, perception, preuve et intégrations de projet
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0030, ADR 0057, ADR 0649, ADR 0721, ADR 0725, ADR 0726, ADR 0727 et ADR 0729

## Contexte

Les démonstrations et qualifications de projet peuvent assembler perception,
ingestion de preuves, investigation et rapport. Les noms d'organisations, actifs,
mandats, rôles spécialisés et scénarios de ces intégrations ne définissent pas le
produit GenOS. Le socle doit réutiliser ses mécanismes biomimétiques existants
sans créer une seconde immunité, une nouvelle autorité ni une voie de promotion
parallèle.

## Décision

Le cycle commun est nommé **surveillance immunitaire de sécurité**. La perception
fournit l'observation, l'évaluation, la calibration, l'abstention et la mémoire
de campagne. Elle peut confier une investigation à un adaptateur de projet et
transmettre le candidat à un vérificateur indépendant distinct. Un candidat seul
ne constitue ni un incident confirmé ni un rapport vérifié. La mémoire
d'incidents du cycle n'est alimentée qu'après réception d'un statut vérifié et
d'un reçu du vérificateur.

Les adaptateurs reçoivent la fenêtre, l'observation et les références de preuves
produites par l'ingestion. Ils portent les formats, mandats, spécialistes,
topologies et politiques propres à leur projet. Les décisions d'autorité restent
dans le noyau d'autorité de sécurité (SAK), le gateway d'actions et les mandats
existants. Le cycle de surveillance ne délivre aucun permis et ne déclenche
aucune mutation.

Le vocabulaire conserve le biomimétisme de GenOS : surveillance immunitaire,
détection, calibration, abstention et mémoire. Les composants restent raccordés
à l'AEIS, aux barrières de preuve, à la Physiologie des spécialistes et à
l'Ontogenèse de sécurité existants ; ils ne redéfinissent pas ces concepts.

Les exportations historiques `runAutonomousWindow` et `runAutonomousCampaign`
restent des alias des API biomimétiques pour préserver la compatibilité.

## Conséquences

- Les règles de confiance, schémas d'artefacts, mandats et rapports CyberCorp
  demeurent des éléments d'intégration et de qualification de projet.
- GenOS n'annonce pas d'investigation ou de rapport vérifié quand l'adaptateur ou
  le vérificateur est absent, ni lorsque le vérificateur ne fournit pas de reçu.
- Les consommateurs peuvent fournir des adaptateurs distincts par fenêtre ou
  campagne ; les mécanismes communs gardent la portée organisation/projet.
- Aucune autorité d'exécution, promotion automatique ou remédiation n'est ajoutée.

## Alternatives

- Incorporer le roster CyberCorp et ses formats de preuve au service partagé :
  rejeté, car cela ferait d'un seul projet la définition du socle.
- Laisser l'investigateur confirmer lui-même son résultat : rejeté, car cela
  supprimerait l'indépendance de vérification et contredirait les portes de
  preuve existantes.
- Créer un moteur immunitaire parallèle : rejeté, car GenOS possède déjà AEIS,
  SAK, ses barrières et sa mémoire immunitaire.
