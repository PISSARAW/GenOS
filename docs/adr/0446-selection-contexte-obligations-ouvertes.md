# ADR 0446 — Sélection du contexte selon les obligations ouvertes

- **Statut** : Accepté pour le raccord de démarrage ; mesure en production ouverte.
- **Date** : 2026-10-12.
- **Domaine** : Mémoire cognitive, contrat d'issue et budget de contexte.
- **Lié à** : [ADR 0383](0383-economie-tokens-conditionnee-aux-preuves.md),
  [ADR 0420](0420-contrat-issue-mission.md).

## Contexte

Le prompt recherchait les souvenirs à partir de la tâche seule. Une mission
munie d'un contrat d'issue pouvait donc relire des expériences sur des
obligations déjà closes, sans transmettre au lecteur les énoncés encore
ouverts, la version du contrat ou son empreinte. Une réduction du budget
historique risquait aussi de privilégier une voie positive devant une
contradiction.

## Décision

Au démarrage, le runtime transmet à l'assemblage du contexte le contrat
persisté et contrôlé par le bootstrap. Le bloc obligatoire nomme la version,
l'empreinte, le statut de vérification et chaque obligation encore ouverte.
La requête de mémoire contient les énoncés ouverts ; la tâche originale reste
la référence pour l'isolation des souvenirs par mission.

Une progression ne clôt une obligation que si sa version et son empreinte
correspondent au contrat et si `missionOutcomeContract.evaluate` confirme sa
preuve. Une liste de succès fournie par l'appelant ne suffit pas. Les
souvenirs explicitement liés à une autre version ou à un autre contrat sont
écartés. Les souvenirs liés uniquement à des obligations closes sont écartés,
sauf les échecs et contradictions de la version courante. Les entrées
historiques sans métadonnées d'obligation conservent leur comportement de
compatibilité. Dans le budget historique, les contradictions précèdent les
expériences positives ordinaires.

Le bloc du contrat et la tâche doivent tenir dans `contextTokenBudget`, sinon
le démarrage échoue. Si seule la mémoire facultative dépasse ce budget, le
runtime conserve la tâche et les obligations, retire la mémoire entière et
inscrit `optional_memory_exceeds_context_budget`. Aucune preuve n'est coupée
silencieusement. Le contrôle du prompt complet par le runtime reste actif.

## Limites

La majorité des souvenirs anciens ne portent pas encore d'identifiants
d'obligation ; leur pertinence dépend de la recherche, pas d'une liaison
prouvée. Ce repli conserve des souvenirs positifs génériques et limite donc
l'économie atteignable jusqu'à leur migration. Le bloc obligatoire présente
le contrat, mais ne prouve pas que le modèle l'a suivi. Les ajouts ultérieurs
de l'hôte sont régis par le contrôle
distinct du prompt runtime. Les compteurs restent des estimations UTF-8.

## Vérification

`node backend/tests/test_mission_obligation_context.js` contrôle la clôture
par deux reçus indépendants, le refus d'une progression obsolète ou déclarée,
le filtrage par obligation/version, le raccord au démarrage et la dégradation
explicite lorsque la mémoire facultative dépasse le budget.
