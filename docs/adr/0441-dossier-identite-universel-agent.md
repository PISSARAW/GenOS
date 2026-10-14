# ADR 0441 — Dossier d'identité commun aux agents

**Statut** : Accepté
**Date** : 2026-10-14
**Domaine** : Identité, agents, runtime

## Décision

Chaque worker, orchestrateur et daemon résident expose un dossier à quatorze
dimensions : existence, continuité, composition, caractéristiques, physiologie
computationnelle, expérience, identité personnelle agentique, relations, fonctions,
origine, état courant, substrat, incertitude et gouvernance. La même structure
sert aux trois types. La valeur de chaque dimension porte un statut et une
provenance, ou une raison explicite pour `unknown`.

`AgentSelf` et `AgentExpressionContext` restent des vues construites à partir
des sources existantes. Le dossier n'est ni une deuxième table d'agents ni une
preuve de conscience. Son empreinte versionne la vue observée; elle ne prouve
pas à elle seule la continuité causale. Une copie avec un autre `agent_id`
constitue un autre agent même si son contenu est identique.

## Première intégration

- `agentSelfService` construit le dossier depuis la ligne `agents`, l'état
  opérationnel et les lectures autobiographiques. Les échecs de lecture sont
  signalés comme inconnus; une valeur de régulation par défaut n'est pas une
  mesure de santé.
- `workerSelfService` expose le même dossier au worker et valide ses dimensions.
- `agentExpressionContextService` ajoute génome, relations, autorité et état
  clinique lorsqu'ils sont disponibles; il signale une vue périmée si une
  mise à jour d'identité n'a pas accès à la base.
- `residentDaemonRuntime` construit le dossier du daemon à partir de son état
  enregistré; `created_at` est conservé entre redémarrages.
- Les chemins d'exécution local et du cycle daemon consultent le statut
  `mayAct` pour arrêter un agent en état terminal.

## Limites et suite

Le manifeste `AgentGenome` et les anciens documents `AgentSelf` restent
compatibles; le dossier est optionnel dans le contrat portable v1 mais requis
par les validateurs de vues construites par le runtime. L'ancien code qui
appelle directement un modèle sans passer par ces vues reste à raccorder.

La suite exige un événement de genèse et un journal de transitions d'identité
pour tous les modes de création, une preuve de parentage par snapshot/AgentGit,
une politique de mutation et de fusion, puis des reçus démontrant pour chaque
décision quelles dimensions ont réellement été utilisées. Les dimensions
`unknown` ne doivent jamais être présentées comme des observations positives.
