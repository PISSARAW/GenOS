# ADR 0626 — Protocole de pensée endogène bornée

- **Statut** : Accepté pour les contrats et la persistance ; runtime et campagne non implémentés
- **Date** : 2026-10-18
- **Domaine** : cognition endogène, expérimentation, autorité, preuve
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0012, ADR 0235, ADR 0295, ADR 0325

## Contexte

GenOS sait entretenir un état hors mission, calculer une curiosité, arbitrer des
modes cognitifs, créer des initiatives SHEV et reprendre des tâches Ontogenèse.
Ces mécanismes ne démontrent cependant pas une chaîne causale complète dans
laquelle un agent détecte une anomalie, produit sa propre question, mène une
recherche bornée, vérifie le résultat, apprend puis décide de continuer ou de
s'arrêter sans nouvelle requête humaine.

Un simple appel périodique à un modèle ne suffirait pas. Il confondrait activité
générée et décision valide, ne garantirait ni l'autorité du mandat, ni la
reprise après crash, ni l'indépendance de la vérification. De même, une sortie
textuelle plausible ne constitue pas une preuve de découverte.

## Décision

Le programme est nommé **Endogenous Thought Test v1**, ou ETT v1. Sa première
tranche fige les contrats, métriques et frontières expérimentales avant tout
raccord au runtime.

Une exécution future suivra la chaîne suivante :

1. un signal interne borné produit un candidat de détection ;
2. une question falsifiable relie ce signal à une hypothèse, un falsificateur
   et un plan de preuve ;
3. SHEV vérifie la finalité et l'autorité du mandat ;
4. AGOW arbitre entre recherche, vérification, simulation et abstention ;
5. Ontogenèse porte la tâche durable et sa reprise ;
6. un vérificateur indépendant classe les propositions ;
7. l'apprentissage et une éventuelle continuation ne consomment que des
   résultats vérifiés ;
8. toute terminaison porte un motif explicite.

Les transitions d'un épisode sont versionnées par le contrat
`EndogenousThoughtEpisode`. La question utilise le contrat
`EndogenousQuestion`. Les états terminaux sont `STOPPED`, `ABSTAINED` et
`FAILED`. Un état vérifié exige des références de preuve ; une transition non
initiale exige la référence du reçu précédent. Chaque transition porte aussi
un `transitionId` stable : une répétition identique restitue le reçu existant,
tandis qu'un même identifiant associé à un contenu différent est refusé.

PR2 persiste les épisodes, questions et reçus dans SQLite sous une portée
organisation/projet. Les questions et reçus sont append-only. La tête d'un
épisode avance transactionnellement avec contrôle de sa version, de son état
et du reçu précédent. La reprise relit et vérifie les empreintes des reçus ;
elle ne rejoue aucune action externe.

Le schéma JSON canonique de la transition est
`spec/cognitive-episode.schema.json`. Il reste aligné avec le validateur du
runtime par un test de parité. Ses métadonnées fixent explicitement que le
contrat n'accorde aucune autorité, n'autorise aucune promotion, n'évalue pas la
conscience phénoménale et ne transporte pas de raisonnement privé.

Le protocole v1 est une simulation déterministe en lecture seule. La finalité
et le mandat restent humains. Aucun prompt supplémentaire n'est injecté après
le lancement. Les budgets, l'autorité, le sandbox et les barrières de preuve ne
sont jamais ablatés. Le mode AGOW global et l'activité endogène restent
désactivés par défaut jusqu'à une décision ultérieure.

La métrique primaire est le nombre de découvertes pertinentes vérifiées par
unité de coût normalisée. Les contrôles et ablations utilisent le même modèle,
les mêmes scénarios, graines et budgets. Les échecs restent dans le
dénominateur. Le corpus réservé ne sert pas au réglage des seuils.

ETT n'évalue pas la conscience phénoménale. Ses résultats éventuels porteront
uniquement sur une capacité fonctionnelle bornée dans le profil exécuté.

## Conséquences

### Positives

- Le protocole précède l'implémentation et réduit les ajustements opportunistes.
- Une question, une décision et une preuve ont des identités distinctes.
- Les reprises refusent les doublons divergents grâce à la lignée et aux clés
  d'idempotence des reçus.
- Les ablations cognitives conservent les frontières de sécurité.
- Un résultat négatif ou inconclusif reste représentable sans faux succès.

### Négatives

- PR2 ne fournit aucun déclenchement autonome et aucune campagne exécutable.
- La vérification indépendante et les oracles scellés restent à implémenter.
- La normalisation des coûts devra être alimentée par des mesures réelles.
- Une campagne locale ne suffira pas à établir une généralisation scientifique.

## Preuves exécutables

- `backend/tests/test_endogenous_thought_contract.js` vérifie les contrats,
  transitions, exigences de preuve et états terminaux ;
- `backend/tests/test_cognitive_episode_schema.js` vérifie la parité entre le
  schéma JSON et le validateur du runtime, ainsi que les frontières non
  promotables du contrat ;
- `backend/tests/test_endogenous_thought_store.js` vérifie l'idempotence, les
  conflits de tête et de lignée, le rollback, l'isolation de portée,
  l'immutabilité et la reprise après redémarrage ;
- le même test vérifie la cohérence entre protocole, conditions d'ablation et
  registre des métriques ;
- aucun test de PR1 ou PR2 ne promeut une capacité ou une propriété de conscience.

## Alternatives écartées

- **Appeler directement un LLM depuis `idleTick`** : absence de file durable,
  d'autorité explicite et de vérification indépendante.
- **Réutiliser tel quel la questionogenèse mathématique en mémoire** : contrat
  non durable, sélection partiellement aléatoire et portée spécialisée.
- **Mesurer le volume de texte ou le nombre de cycles** : activité sans valeur
  épistémique démontrée.
- **Ablater SHEV entièrement** : suppression indue de frontières d'autorité ;
  seule sa contribution cognitive sera neutralisée.
- **Activer AGOW globalement avec PR1** : les contrats ne constituent pas une
  preuve suffisante pour modifier un défaut de production.
