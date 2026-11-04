# Morphogenèse exécutée pendant « Le Dernier Sas » — 4 novembre 2026

## Résultat constaté

Le run `ateam_fdabf90e65bf17c6de7857246ea6ccbc` est `COMPLETED` et sa
clôture collective est `success: true`. Pendant ce même run, le scheduler a
remplacé le dramaturge encore en attente par un autre acteur natif, réaffecté
son travail, puis lancé ce remplaçant. Le scénario complet livré contient
6 scènes et 2 241 mots utiles selon le compteur du contrat GQEL.

Le livrable natif est `D:\scenario-court-metrage\LE_DERNIER_SAS.morphogenese.md`.
Une publication opérateur strictement identique a ensuite remplacé
`D:\scenario-court-metrage\LE_DERNIER_SAS.md`, après sauvegarde de la version
précédente. Le reçu natif reste lié à son chemin d'origine ; aucune destination
gelée du run n'a été modifiée pour fabriquer un second reçu natif.

- SHA-256 : `83e06841cfc37b0cb9b47b2cd42142fbc1b26c05043f3fe52dc199b1d0d79897`.
- Taille : 14 556 octets UTF-8.
- Reçu final : `gqel-16d44ec2720a498acae93bfe2f7a2a1c5b2098adf909ed3fa6042b88c544a737`.
- Score : 100 selon le lecteur GLM indépendant déclaré au contrat.
- Mission native : `mission_a56ddf5a-4ebb-47d0-9656-d9ee4699e61b`.

Le score est une évaluation bornée du texte, pas une preuve d'amélioration
artistique causée par le remplacement. `claimedDurationVerified` reste `false` :
une représentation effective de vingt minutes n'a pas été chronométrée.

## Défaut initial et correction

Le plan de formation seul portait `adaptiveRestructuring: false`. Le parcours
adaptatif historique enregistrait des propositions et le scheduler conservait
sa liste initiale. La réparation externe refusait à juste titre une lease de
runner active. Ces mécanismes ne prouvaient aucun changement pendant la mission.

Le [premier audit](audit-mission-dernier-sas-2026-11-03.md) conserve les trois
problèmes précédents : budget créatif incohérent, contrat de preuve incomplet et
publication non liée aux octets effectivement validés. Leur correction a été
commitée sous `eba94474c`. Le présent changement ajoute une restructuration
réelle, dans le périmètre borné de l'[ADR 0789](../adr/0789-morphogenese-live-des-equipes-a-team.md).

La politique `adaptiveMorphogenesis` est explicite et immuable. Le déclencheur
est un défaut observé dans une session GQEL authentifiée d'un producteur terminé.
Un candidat dormant, sans exécution ni allocation supplémentaire, reçoit le
travail du consommateur en attente. Le type, les droits et les obligations de
qualité ne sont pas élargis. Le runtime propriétaire agit entre deux étapes,
avec snapshot durable, admission Rust, hystérésis, MORPH et AgentGit.

Le roster, les rôles et le WorkGraph sont persistés dans le commit natif. Un
savepoint protège l'atomicité même sous la transaction externe du protocole.
Les preuves déjà acceptées sont conservées et les handoffs destinés à l'ancien
consommateur sont invalidés puis reconstruits. Le scheduler relit le roster
persisté et exécute le nouveau worker. La clôture revérifie le reçu de transition,
la décision durable du protocole et les preuves des nouveaux membres.

## Séquence réelle et identités

| Étape | Observation persistée |
| --- | --- |
| Producteur initial | `worker_b63410b8cfe6bb7275296e5bc1e50f4f`, run `strategy_run_1793779610664_95702735` |
| Réparations réelles | 1 839 puis 1 916 mots : `DELIVERABLE_INCOMPLETE` ; troisième version de 2 257 mots acceptée, score 80 |
| Consommateur initial | `worker_c980efd3250ea1c1e8b21b5436434075`, rôle `dramaturg`, aucune exécution dans `strategy_execution_runs` |
| Transition pendant la mission | `tx-27b7907c`, Rust `APPLY`, protocole MORPH `finalized` |
| Commit natif | `agent-git-commit-1793779765937-f05ffc1c` |
| Remplaçant réel | `worker_7be22668263a86b1d1972b5b06dfbd66`, rôle `literary_author`, run `strategy_run_1793779775565_de571311` |
| Clôture du remplaçant | Exécution native `completed`, reçu GQEL authentifié, handoff accepté, 2 241 mots et 6 scènes |
| Clôture collective | Les deux membres exigés sont le producteur et le remplaçant ; `success: true`, tous les contrôles de clôture passent |

L'horodatage du producteur terminé précède le COMMIT de morphogenèse, qui précède
la création du run du remplaçant. Le script de vérification contrôle cet ordre.
Il authentifie les reçus GQEL, vérifie les preuves natives terminées, le roster,
le graphe, le snapshot, le commit AgentGit et les décisions `COMMIT`/`FINALIZE`
dans la base durable du coordinateur. L'export signé est ensuite revérifié avec
les octets du fichier et une reprise idempotente de la livraison.

L'allocation reste de 224 999 jetons par travail, soit 449 998 au total. MORPH
transfère une tâche et son budget du consommateur initial vers le remplaçant.
Au moment de la transition, le producteur a dépensé 99 520 jetons mesurés. Le
remplaçant en consomme ensuite 42 570. Les plafonds GQEL restent de 150 000
jetons pour chaque boucle ; aucune consommation n'est remise à zéro.

## Concepts effectivement parcourus

| Mécanisme | Preuve et portée |
| --- | --- |
| Formation A-Team et WorkGraph | Formation persistée, dépendance auteur → intégration, propriété du nœud transférée |
| Incarnation native et autorité de mission | Deux nouveaux runs natifs scellés, vérification des preuves de clôture |
| GQEL et critique indépendante | Gemma pour la génération, GLM en contexte frais pour les revues, réparations réelles, reçus liés au texte |
| Handoffs et intégration | Ancien destinataire invalidé, nouveau handoff évalué par le remplaçant |
| Morphogenèse gouvernée | Admission Ed25519 vérifiée par Rust, hystérésis persistée, MORPH réel, commit AgentGit |
| Budgets et confinement | Allocations conservées, dépenses mesurées, acteurs du même tenant et workspace, acteur actif refusé |
| Reprise et annulation | Tests avec vraie admission/native COMMIT ; panne de persistance, perte d'ACK, refus du second lancement |
| Clôture et publication | Garde morphologique ajoutée, qualité finale authentifiée, export vérifié par empreinte |

Ce run ne démontre ni préemption d'une inférence active, ni recrutement
arbitraire, ni activation de toutes les variantes biologiques, ni comparaison
contrefactuelle de plusieurs équipes. Ces concepts ne sont pas nécessaires au
parcours testé. Le changement réalise un remplacement créatif en attente.

## Incidents de qualification conservés

Le premier essai `ateam_e8506295d8370975224695b77d26fe88` a effectivement
produit son auteur, puis refusé la transition : le plan contenant les prompts
complets dépassait 64 Kio. La limite Rust n'a pas été augmentée. Les empreintes
de l'état persistant remplacent maintenant ces duplications et sont revérifiées
avant application. Le plan réellement admis du second essai mesure 3 406 octets.

Un test de panne a aussi révélé que la transaction imbriquée partageait celle
du protocole. Une erreur convertie en reçu pouvait alors conserver la projection
du roster. Le savepoint couvre désormais toute la persistance du commit. Les
tests vérifient la restauration du roster, des rôles et du graphe et conservent
l'irréversibilité de la décision MORPH ; aucune relance implicite n'est permise.

## Dossier d'exécution local

Les artefacts restent hors Git sous
`D:\GenOS-runs\adaptive-morphogenesis-20261104\attempt-2` :

- `mission.request.json`, journaux et `mission-exit.json` : demande et sortie réelle, code 0.
- `authority-public.json` : identité publique de l'autorité éphémère ; clé privée conservée uniquement dans les processus de l'essai.
- `team-after-transition.json`, `team-final.json`, `workgraph-final.json` : projection réelle et état final.
- `execution-proof.json` : reçus, séquence temporelle, décisions et événements durables MORPH, métriques et livraison revérifiées.
- `literary_creation-quality.json`, `dramaturgy-quality.json` : sessions et reçus GQEL authentifiés.
- `canonical-publication.json`, `LE_DERNIER_SAS.precedent.md` : copie canonique identique et sauvegarde du livrable précédent.

La suite `test_ateam_live_morphogenesis.cjs` distingue ses réponses LLM
synthétiques de l'admission Rust et du protocole natif réellement exécutés.
Elle couvre le contexte créatif volumineux, la conservation des preuves et du
budget, la MAC forgée, le worker actif, l'autorité absente, la révision concurrente,
le COMMIT sans ACK, le rollback de projection et l'idempotence. Les tests natifs
MORPH existants passent aussi. La suite qualité complète passe ses 26 tests.
`cargo test --workspace` termine avec le code 0 : 1 196 tests réussis, aucun
échec ni test ignoré. Le contrôle global du code vérifie 8 853 fichiers et ne
signale aucune nouvelle violation. Les journaux sont conservés dans le dossier
parent de qualification.

La suite racine `npm test` déjà active dans ce même checkout sous le PID 32268
termine avec le code 0 le 4 novembre à 08:28:44 UTC. Son résultat a été attendu
par un handle de processus et conservé dans `npm-existing-owner-result.json`,
avec commande, chemin du verrou, identité et horodatages. Une seconde copie
globale n'a pas été lancée après ce résultat ; les suites natives MORPH,
A-Team et qualité du correctif ont été exécutées séparément avec leurs journaux.
