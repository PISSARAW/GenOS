# Autopsie de compétence et couverture réelle de GenOS

- **Date** : 2026-11-04.
- **Nature** : audit rétrospectif, sources expérimentales inchangées.
- **Campagne auditée** : `89585992-5af7-4fd0-bc2a-e843d60ec290`.
- **Commit expérimental** : `43fad7b5bac93369863488386abb429a1eda6616`.
- **Verdict de couverture** : le banc ne passe pas par tout le runtime GenOS.

## Ce que le résultat permet de conclure

Le [rapport principal](competence-cinq-variantes-controle-positif-2026-11-04.md)
reste valide dans son périmètre : Qwen2.5-Coder 7B, observations passives,
rappel de mémoire, programmes typés et synthèse affine. Les scores finaux
restent 0/48 sans mémoire, 0/48 historique, 1/48 rappel GenOS, 18/48 synthèse
et 18/48 hybride. Les deux contrastes primaires restent non soutenus.

**Cette campagne ne constitue pas un essai du système autonome GenOS complet.**
Le script envoie directement les requêtes à Ollama. Il utilise des services
de production de GenOS, mais ne délègue pas ces requêtes à ses agents supervisés.
L'usage du MCP GenOS par le développeur autour du banc est distinct de la
chaîne de décision du Qwen évalué.

## Couverture de la chaîne primaire

La présence d'un fichier dans les quarante sources archivées ne démontre
pas que toutes ses fonctions ont été appelées. Quinze fichiers de production
figurent dans cette fermeture de dépendances ; le tableau distingue les
appels explicites et les mécanismes absents du chemin primaire.

| Mécanisme | Utilisation dans la campagne | Preuve et limite |
| --- | --- | --- |
| Mémoire épisodique persistante | Oui | `memory.cjs` appelle `recordMemory` et `listMemories` ; 600 observations dans la base dédiée |
| Checkpoint et restauration | Oui, état borné | `AdaptiveStateService.persistObject/restoreObject` ; compte et empreinte des observations, pas un état cognitif complet |
| Rappel pertinent | Oui, politique du banc | Filtre par opérateur et époque ; pas une qualification de toutes les stratégies de rappel |
| Synthèse et consolidation affine | Oui, temporaires | `methods.cjs` appelle `synthesize/consolidate`, reconstruit `procedures` puis l'interprète à chaque question |
| Rétention des programmes découverts | Non | Les procédures temporaires ne sont pas enregistrées dans l'état adaptatif des mondes |
| Expériences d'échec consultées par le Qwen | Non | Sa base dédiée contient les observations ; les mémoires MCP du développeur sont dans le plan de contrôle séparé |
| Application et abstention | Oui, mélange explicite | Interpréteur typé du banc, garde de couverture, seuil minimal d'exemples et service de politique d'abstention |
| Routage cognitif GenOS | Non | `llm.cjs` fait directement `fetch` vers `/api/chat` d'Ollama |
| Agent, génome et contrat supervisé | Non pour les propositions primaires | Les identifiants de monde ne sont pas des runs de workers incarnés |
| Orchestrateur, topologie et communication | Non | Aucune délégation dans `run.cjs` ; la permutation des variantes est faite par le banc |
| Budgets du runtime et réserve collective | Non | Compteurs et limites HTTP du banc ; absence de règlement des coûts de workers dans cette chaîne |
| Barrière de dossiers de workers | Non | Oracle séparé et audits rétrospectifs ; ils ne constituent pas une barrière de synthèse de l'orchestrateur |
| Apprentissage actif | Non | Suite fixe d'observations, aucune sélection de sondage par l'agent |
| Forks, sélection et héritage de stratégies | Non | Six mondes indépendants générés par le banc, sans lignées de stratégies sélectionnées |
| Mutation et adaptation de politique | Non | Poids, politique et prompts gelés ; aucune évolution des stratégies durant les cent observations |
| Continuité et récupération de processus | Non évaluées | La restauration de mémoire est testée, pas une panne ou reprise de workers |
| Reconnaissance native des limites | Faible et partiellement erronée | Les 24 lacunes reconnues au final par GenOS sont refusées par les gardes structurelles |

Les événements primaires sont exactement un manifeste, 600 observations,
1 800 prédictions, 30 checkpoints et un rapport. Cette observation complète
la lecture du code ; l'absence d'un type dans ce seul journal ne prouverait
pas, à elle seule, l'absence de son mécanisme ailleurs dans la plateforme.

## Pourquoi la compétence ne progresse presque pas

### Le contrôle positif ne couvre pas toute la capacité mesurée

Les seize cas positifs fournissent les bons objets de règle. Ils contrôlent
leur transcription et leur exécution, alors que la campagne demande d'inférer
les coefficients depuis des exemples. Le second essai de développement
échouait déjà sur les quatre cas d'induction. Un contrôle d'induction
indépendant aurait dû qualifier cette capacité séparément avant d'interpréter
le banc comme un test de progression d'un agent complet.

La campagne conserve une mesure valide de ses ablations bornées et de leurs
échecs. Le contrôle positif ne supprime toutefois pas l'effet de plancher
sur l'induction. L'inadéquation entre ce contrôle et la portée initialement
visée est une limite du protocole, pas seulement une faiblesse du modèle.

### La correction change souvent la décision, pas la règle

Sur les 374 questions ayant reçu une deuxième proposition, **309 conservent
exactement les mêmes objets de programme**, dont 290 finissent par une
abstention. Ce compte compare les tableaux de programmes sérialisés, sans
assimiler deux descriptions différentes à une même fonction. Aucune des
374 corrections ne produit une résolution utile supplémentaire.

Les témoins de rejet effectivement reconstruits sont des contradictions
sur les exemples d'entraînement. Le problème résiduel ne vient donc pas
uniquement d'une liaison d'opérateur ou d'époque : les coefficients restent
faux malgré des contre-exemples publics. Sur toute la campagne, dix plans
sont exécutés : neuf sont ambigus et un seul est justifié. Aucun plan LLM
quadratique ou à charnière n'est admis.

334 propositions d'abstention conservent un programme alors que le prompt
demande une liste vide. Elles passent le contrat syntaxique, qui ne vérifie
pas cette relation entre champs. Le programme n'est pas exécuté lorsque
le modèle s'abstient ; ce constat ne transforme pas ces réponses en erreurs
d'exécution. Il borne la signification de « sortie native valide ».

### La réussite ponctuelle ne devient pas une procédure acquise

L'unique réussite GenOS propose correctement deux règles affines dans une
composition. Les mêmes règles permettraient de résoudre deux questions
directes du même contrôle, sur lesquelles le modèle s'était abstenu. Ces
questions précèdent la réussite : ce constat rétrospectif ne permet pas
de leur attribuer un succès par mise en cache après coup.

Il révèle toutefois l'absence d'un objet procédural stable dans le protocole :
le programme est reproposé pour chaque question, sans consolidation durable
des découvertes dans la mémoire du monde. Cent observations ne représentent
pas cent cycles d'action, évaluation, découverte et réutilisation d'un agent.
Dans chacun des six mondes, les cent lignes ne contiennent que 31 triplets
distincts opérateur/époque/entrée. La répétition augmente l'historique sans
apporter cent informations indépendantes.

### Une règle cohérente ne suffit pas à lever l'ignorance

Un cas admis à l'étape 16 contient `(-2,-5)`, `(-1,-4)`, `(0,-3)`, `(1,-2)`.
Neuf paramétrisations publiques restent compatibles, correspondant à sept
fonctions distinctes dans cette classe. Elles donnent toutes la même valeur
à zéro ou deux, mais se séparent au-dessus de la charnière.

Le recalcul des sondages, avec un a priori uniforme explicite sur ces sept
fonctions, donne zéro bit d'information attendu à zéro ou deux et environ
2,807 bits à sept. La primitive GenOS `next_probe`, limitée aux candidats
d'entraînement, sélectionne effectivement `x=7`. Il s'agit d'un diagnostic
rétrospectif calculé sur les observations publiques, sans nouvelle réponse
LLM, sans résultat réservé appris et sans modification des scores primaires.

À l'étape 16, GenOS donnait huit réponses confiantes non identifiables.
Au final, sur les 117 abstentions du modèle concernant des questions pourtant
identifiables, toutes variantes concernées réunies, 67 déclarent `missing`
et 50 `ambiguous`. Le modèle confond encore absence de définition, difficulté
d'inférence et ambiguïté réelle. La prudence finale du système ne démontre
donc pas une connaissance fiable de ses limites par le LLM.

## Opérations GenOS réellement utilisées pour cet audit

Le MCP connecté expose seize outils. Recherche des échecs, enregistrement de
six hypothèses, checkpoint du développeur, analyse de trajectoire et pipeline
de primitives ont été réellement appelés. Le pipeline invalide l'hypothèse
`ALL_GENOS_EXECUTED_IN_PRIMARY_BENCHMARK`, recalcule l'écart descriptif de
2,08 points et classe des sondages fournis par l'audit. Il ne découvre pas
ces preuves par une inférence indépendante et son classement ne remplace
pas le test statistique préenregistré.

L'analyse de trajectoire reçoit 120 propositions réelles, correspondant aux
60 premières corrections. Elle trouve 54 programmes distincts, un taux de
répétition de 0,55 et `loopDetected=true`. Cette métrique compte des actions
répétées dans les données fournies ; plusieurs questions peuvent légitimement
utiliser la même règle. Elle ne prouve pas seule une boucle cognitive.

Le checkpoint créé est `snap-b16dfd9e72d84a51821fb418bad5e8d3`.
L'audit CLI de ce checkpoint échoue faute de capsule correspondante ; le
rejeu MCP est refusé par la règle de propriété des capsules. Aucun de ces
appels n'est présenté comme un rejeu réussi de l'expérience.

Les requêtes d'orchestration utilisent un workspace D rattaché au scope
existant `ws-local`, dans `org-local/project-local`, sans inventer de tenant.
Les essais d'admission conservent les refus : workspace initialement non
rattaché, budget insuffisant pour le biome automatique, puis topologie
`isolated_baseline` refusée par le point d'entrée de morphogenèse malgré
la présence d'un compositeur de ce nom. Une lecture de l'organisation est
également refusée à l'identité MCP non recrutée dans cette organisation.

Une demande Trinity distincte est bornée à 40 000 tokens, deux dollars et
huit minutes, en lecture seule. La limite de transport MCP de 120 secondes
interrompt cette demande sans reçu terminal exploitable. Le CLI officiel
est ensuite utilisé avec le même contrat et le même budget. Son premier
passage refuse une racine de capsules hors du workspace de l'audit.

La configuration de cette seule commande est corrigée pour placer les
capsules dans `workspace/.genos-agent-worlds`, sur D. Les trois workers
Trinity sont alors préparés et la chaîne atteint `finishSatisfiedBarrier`,
mais **la clôture échoue avec `MISSION_TRUTH_GRAPH_UNAVAILABLE`**, code de
sortie 1. L'orchestrateur concerné est
`mcp_orchestrator_76e61d09-ab72-4828-8e65-d6bee1827426`.

| Observation finale | Ce qu'elle établit |
| --- | --- |
| Trois préparations de workers et capsules isolées | Le chemin d'orchestration et d'isolation est effectivement parcouru |
| Pile d'appel de la barrière d'évidence | La mission atteint la validation des dossiers et la compilation du graphe de vérité |
| Graphe indisponible ou non mesuré | La décision de clôture est refusée ; aucune réussite métier ni promotion |
| `genos_blame` refusé pour le scope du caller | Les reçus de cette autre workspace ne sont pas accessibles par cette identité MCP |
| Aucun reçu vérifié d'inférence produit dans le résultat accessible | Le nombre d'inférences de ces workers n'est pas certifié par cet audit |

Le code courant du compilateur renvoie `insufficient_data` pour un graphe
vide et `unavailable` lors d'une exception. La porte de preuve refuse les
deux. L'erreur terminale ne permet pas de trancher entre absence de données,
erreur de lecture et liaison mission/run/scope incorrecte ; l'accès aux reçus
scopés serait nécessaire pour isoler cette cause. Le refus n'est ni désactivé
ni transformé en succès.

Les tests ciblés `test_worker_truth_graph_gate.js` et
`test_mission_truth_sources.cjs` passent avec code zéro. Ils couvrent le
refus d'un graphe vide ou indisponible, l'isolation de mission et le refus
d'un succès étayé uniquement par un outil en échec. Ce sont des contrôles
sur fixtures, pas une validation de la mission Trinity qui vient d'échouer.

Le runtime de cette contre-revue provient du checkout courant, où des
modifications concurrentes affectent notamment le compilateur et la barrière.
Sept fichiers et leurs empreintes sont archivés après l'exécution dans
`runtime-source-at-end` et `runtime-source-state.json`. Cette capture finale
ne remplace pas un gel de tout le runtime au lancement. Les quarante sources
de la campagne primaire, elles, restent scellées et ont été revérifiées.

Un effet de bootstrap est également observé : `ws-local` a temporairement
pointé vers le workspace D, conformément à l'upsert de `seed.js` dépendant
de `GENOS_WORKSPACE_ROOT`. Le contrôle final le retrouve à son chemin C
initial, sans mise à jour compensatrice nécessaire. Le workspace D distinct
`ws-5b97bff5c0fd` reste enregistré dans le tenant d'origine. Les essais CLI
ultérieurs utilisent la base existante sans relancer son bootstrap ; les
contrôles d'autorité, de budget, de confinement et de preuve restent actifs.

Un essai de commande réutilisait un fichier `--payload-file` déjà consommé
et supprimé par le CLI. Il a échoué avant toute admission et a été corrigé
en séparant copie d'archive et fichier de transport. Cet incident de
préparation n'est pas attribué au raisonnement de GenOS.

**La contre-revue n'est donc pas une validation de tout GenOS.** Elle exerce
un chemin plus complet, expose ses refus et ses limites d'observabilité,
sans modifier rétrospectivement la couverture de la campagne primaire.

## Conditions avant un essai du système complet

1. Fixer une liste de capacités pertinentes et exiger des reçus pour chacune :
   identité, génome, admission, topologie effective, workers, appels modèle,
   communications, dossiers, budgets et décision finale. Une dépendance importée
   ou un reçu de lancement ne valide pas une capacité.
2. Réussir séparément les contrôles d'application, d'induction et d'ambiguïté,
   avec le même modèle et le même budget que l'essai réservé.
3. Raccorder les expériences de l'agent, ses règles validées et ses échecs à la
   mémoire consultée par ses prochaines décisions. Vérifier la réutilisation
   après restauration, sans retour des réponses réservées.
4. Faire choisir des observations discriminantes dans le seul domaine
   d'entraînement et en compter les coûts. Distinguer cette acquisition active
   du protocole à observations passives.
5. Comparer des ablations du même pipeline autonome, avec les mêmes plafonds
   de ressources et une séparation explicite entre réussites LLM et outils.
6. Publier les limites reconnues avant et après les gardes, la couverture et
   les refus inutiles. Ne pas assimiler abstention générale et compétence.
7. Geler aussi le plan de contrôle et les sources du runtime, qualifier le
   graphe de vérité et la liaison des scopes, puis utiliser de nouveaux mondes
   réservés. Les anciens résultats divulgués pour l'autopsie ne doivent pas
   redevenir un test prétendument inédit.

Activer tous les mécanismes biomimétiques sans relation avec la tâche ne
constituerait pas une meilleure preuve. La couverture doit être définie,
exécutée et vérifiée ; les capacités non exercées restent non évaluées.

## Artefacts et reproductibilité

Les artefacts sont conservés dans
`D:/genos-competence-results/full-runtime-audit-20261104` :
`audit-input-provenance.json`, `analyze.cjs`, `posthoc-diagnosis.json`,
`trajectory.json`, `genos-receipts.json`, `mission-request-archive.json`,
`mission-cli.log`, `mission-cli-contained-retry.log` et les copies de preuve
dans `workspace/evidence` et `workspace/sources`. Le document est relié à la
décision GenOS `decision-60abce64-a65a-4486-9e35-65a0ab47b98b`.

Les vérifications de calcul et de provenance aboutissent avec code zéro.
Les journaux des deux contrôles de portes sont `truth-gate-test.log` et
`truth-sources-test.log`. Aucun code produit du dépôt n'est modifié par cette
autopsie et les modifications concurrentes restent hors de son commit.

`analyze.cjs` vérifie les quarante empreintes archivées, reconstruit les
témoins de rejet et les candidats compatibles, et recalcule les comptes
décrits ici. Aucun résultat primaire n'est remplacé ni relancé.

```powershell
node D:/genos-competence-results/full-runtime-audit-20261104/analyze.cjs
```
