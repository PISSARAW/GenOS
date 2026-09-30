# ADR 0177 — Routage cognitif, plasticité persistée et sélection relationnelle

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Signalisation, cognition, relations inter-agents, persistance
- **Décideurs** : GenOS maintainers
- **Lié à** : [ADR 0166 — Livraison durable des signaux](0166-livraison-durable-signaux.md), [ADR 0173 — Noyau de routage et niveaux de vérification](0173-noyau-routage-et-niveaux-de-verification.md)

## Contexte

Le plan de signalisation produisait déjà `llmRequired`, mais le subscriber ne
dirigeait pas ces signaux vers un service de génération dédié. Les poids des
canaux de plasticité étaient uniquement en mémoire. Les sélecteurs relationnels
existaient, sans être exposés par les chemins runtime de planification de
partenaires et d'affectation de vérificateurs.

## Décision

- Le subscriber délègue les signaux admissibles par le gate VoI à
  `cognitiveSignalService`, qui appelle `modelRouter.generate` pour la cible
  cognitive sélectionnée.
- Les poids de canaux restent disponibles en cache mémoire, avec une table
  SQLite `signal_channel_weights` comme source de rechargement et de persistance.
- Le planificateur Holobionte expose le résultat du sélecteur relationnel pour
  ses candidats déjà éligibles. Les affectations épistémiques peuvent utiliser
  le sélecteur de vérificateur indépendant si le contexte leur fournit un
  catalogue de candidats.
- Une réponse de modèle ou un score relationnel ne vaut pas exécution, preuve ou
  promotion. Les gates existants restent autoritaires.

## Conséquences

### Positives

- Les signaux cognitivement non résolus empruntent un service de modèle explicite.
- L'apprentissage de routage survit au redémarrage du backend.
- Les classements relationnels alimentent les sorties runtime tout en excluant
  les liens de filiation pour la vérification indépendante.

### Négatives

- L'écriture des poids est asynchrone ; une panne SQLite est journalisée et peut
  perdre la dernière mise à jour volatile.
- Le choix relationnel reste consultatif pour l'acquisition d'un partenaire et
  dépend de la présence d'un catalogue pour sélectionner un vérificateur.

## Alternatives

- Garder `llmRequired` comme simple signal de métrique : rejeté, car aucune
  cognition ne serait déclenchée.
- Garder les poids uniquement dans une `Map` : rejeté, car les redémarrages
  effacent le signal d'apprentissage.
- Laisser les sélecteurs relationnels isolés des résultats runtime : rejeté,
  car leurs décisions ne seraient pas consommables par les planificateurs.
