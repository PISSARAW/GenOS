# ADR 0626 — Protocole de pensée endogène bornée

- **Statut** : Accepté jusqu'à l'apprentissage borné ; continuation et campagne non implémentées
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

PR3 ajoute la première frontière runtime : un détecteur déterministe, désactivé
par défaut, évalue une observation SHEV intègre dans la portée d'un agent et
d'une responsabilité active. Les évaluations admises comme refusées sont
persistées de manière immuable et idempotente. La politique borne le score, le
gain d'information, la progression, le nombre d'épisodes ouverts, la période
de refroidissement et le budget.

Une admission ouvre un épisode `DETECTED`, persiste une question falsifiable
avec ses sources, son hypothèse, son falsificateur et sa méthode, puis avance
l'épisode à `QUESTIONED`. Cette étape ne crée aucune tâche, ne lance aucun outil
ou modèle, n'accorde aucune autorité et ne rend rien éligible à la promotion.

PR4 arbitre ensuite la question avec le service AGOW déterministe, utilisé comme
fonction pure : aucun candidat n'est publié, aucun cycle global n'est déclenché
et `GENOS_AGOW_MODE` n'est pas modifié. Le candidat d'investigation est comparé
à une abstention planifiée. La décision versionnée est persistée de manière
immuable et idempotente avant la transition vers `ADMITTED` ou `ABSTAINED`.
L'ablation `agow_arbitration_ablated` sélectionne obligatoirement l'abstention.

Cette admission conserve `taskRef` et `jobRef` à `null` et scelle cinq
frontières négatives : aucune autorité, aucune promotion, aucune tâche, aucune
action externe et aucune mutation du mode AGOW. La création Ontogenèse et la
mise en file restent réservées à la tranche suivante.

PR5 matérialise une admission dans `ontogenesis_backlog`. Le titre et les
critères d'acceptation proviennent du contrat de question ; l'identité de tâche
et le reçu de liaison sont déterministes. Leur insertion est atomique et le
reçu est immuable, idempotent et isolé par organisation et projet. L'épisode
avance ensuite de `ADMITTED` à `QUEUED` avec ce `taskRef` et sans `jobRef`.

La tâche naît volontairement en statut Ontogenèse `blocked`. Cette retenue
n'est pas un refus de l'épisode : elle empêche le sélecteur et une boucle déjà
active de démarrer un worker avant une autorisation d'exécution séparée. Le
reçu scelle l'absence d'autorité d'exécution, de worker, d'action externe et de
promotion. Une tranche ultérieure devra lever explicitement la retenue avant
la transition `QUEUED` vers `RUNNING`.

PR6 lève cette retenue uniquement sur présentation d'une autorisation SHEV
Ed25519 dont l'opération, le projet, l'épisode, la version et la tâche sont
scellés. L'autorisation est consommée transactionnellement avec un run
Ontogenèse durable. Le runner est une fonction déterministe en processus,
limitée à la simulation en lecture seule : il ne lance aucun worker, n'accède
pas au réseau et ne mute aucun environnement.

Le run recopie l'hypothèse, le falsificateur et le plan de preuve dans une
proposition traçable, place la tâche en `verifying` et le run Ontogenèse en
`unverified`, puis avance l'épisode de `QUEUED` à `RUNNING`. Son reçu scelle
explicitement que la proposition n'est ni vérifiée ni promotable. La reprise
relit le même reçu et refuse toute autre demande pour l'épisode.

PR7 ajoute une barrière de vérification indépendante à deux signatures. Une
autorisation SHEV lie le projet, l'épisode, le run, sa version, la politique et
l'oracle. Une clé Ed25519 distincte de l'autorité et du producteur signe ensuite
le verdict, les références de preuve et l'empreinte exacte de la proposition.
Le reçu classe le résultat comme `supported`, `refuted` ou `inconclusive`.

Après persistance atomique, le run Ontogenèse passe à `verified`, la tâche à
`done` et l'épisode de `RUNNING` à `VERIFIED`. Cet état signifie que la
classification indépendante est terminée, pas que l'hypothèse est soutenue :
un verdict réfuté ou inconclusif suit la même transition explicite. Le reçu
interdit encore l'apprentissage, la continuation, l'action externe et la
promotion.

PR8 consomme cette classification dans un registre de croyance limité à
l'épisode. Une autorisation SHEV `ett-learn` lie la vérification, sa version,
son verdict, la politique et la cible `ett-episode-belief`. La révision est
déterministe : `supported` renforce provisoirement, `refuted` corrige dans la
portée de l'épisode et `inconclusive` diffère toute modification.

Le reçu `EndogenousThoughtLearning` est immuable, rejouable et isolé par
organisation et projet. Il avance l'épisode de `VERIFIED` à `LEARNED`, mais ne
modifie aucune mémoire de production, n'autorise aucune continuation ou action
externe et ne rend aucun résultat promotable.

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

- PR8 fournit une révision de croyance locale, mais aucune continuation ou campagne exécutable.
- Les oracles de la campagne réservée restent à sceller sur le corpus final.
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
- `backend/tests/test_endogenous_thought_detection.js` vérifie le défaut inactif,
  le mandat SHEV, les seuils bornés, la persistance des refus, la question
  falsifiable, l'idempotence, l'isolation de portée et l'absence de tâche,
  d'autorité supplémentaire ou d'action externe ;
- `backend/tests/test_endogenous_thought_admission.js` vérifie l'arbitrage AGOW
  sans effet, les transitions `ADMITTED` et `ABSTAINED`, l'ablation, le reçu
  versionné, l'idempotence, l'isolation de portée, l'immutabilité et l'absence
  de tâche, de job ou de mutation du mode AGOW ;
- `backend/tests/test_endogenous_thought_queue.js` vérifie la liaison atomique
  avec le backlog Ontogenèse, la transition `QUEUED`, l'idempotence,
  l'immutabilité, l'isolation de portée, le refus d'une admission ablatée et la
  retenue qui interdit toute sélection, exécution ou création de run ;
- le même test vérifie la cohérence entre protocole, conditions d'ablation et
  registre des métriques ;
- `backend/tests/test_endogenous_thought_runner.js` vérifie l'autorisation SHEV
  signée, sa consommation atomique, la proposition déterministe, le run durable,
  la reprise, l'isolation de portée et l'absence de worker, de mutation, de réseau,
  de vérification ou de promotion ;
- `backend/tests/test_endogenous_thought_verification.js` vérifie la double
  signature Ed25519, l'indépendance des identités et des clés, les verdicts
  scellés, l'idempotence, la reprise et la transition vers `VERIFIED` sans
  apprentissage, continuation ou promotion ;
- `backend/tests/test_endogenous_thought_learning.js` vérifie que seul un verdict
  indépendant intègre peut produire une révision autorisée, bornée, immuable et
  reprenable, avec report explicite des résultats inconclusifs ;
- aucun test de PR1 à PR8 ne promeut une capacité ou une propriété de conscience.

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
