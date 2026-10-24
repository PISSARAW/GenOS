# Campagne d'autonomie générale de l'Ontogenèse — 2026-10-24

## But et limite actuelle

Le parcours réel consigné dans la [qualification précédente](qualification-ontogenese-reelle-2026-10-23.md)
prouve qu'une mission précise peut atteindre la vérification et l'intégration.
La mission n'a réussi qu'à la huitième tentative. Les traces du run contiennent
notamment des interruptions runtime, un timeout de la barrière de preuves et des
attentes liées aux ressources. Cela ne suffit pas à qualifier la généralité ou
l'autonomie durable.

Cette campagne sépare les contrats locaux, les missions de dépôts pilotes,
la reprise sur incident, le transfert hors échantillon et l'exploitation dans
la durée. Une preuve de transport, de worker lancé ou de commit créé ne vaut
jamais une acceptation de tâche.

## Premier relevé sur V3

- Base du checkout isolé : `c7c6bc718b794d69d183759ad1ef5b0fcbaa6657`.
- Commande : `node backend/tests/run_ontogenesis_suite.js`.
- Le premier passage dans le checkout principal était contaminé par les
  modifications locales présentes. Il a passé les scénarios jusqu'à
  `test_ontogenesis_ritual.js`, puis la garde mémoire a renvoyé
  `ressources-contraintes` à la place de `rituel-en-cours`.
- Le premier passage a terminé avec le code 1 : le deuxième tick du test attendait
  `rituel-en-cours`, mais la garde mémoire a renvoyé `ressources-contraintes`.
  L'hôte mesurait 6,76 Go libres sur 27,98 Go, soit environ 24,1 %, sous le seuil
  contraint par défaut de 25 %.
- Après récupération de la mémoire libre à 11,64 Go, la relance isolée de
  `node backend/tests/test_ontogenesis_ritual.js` a réussi.
- Un checkout isolé de la base `c7c6bc7` a révélé un défaut réel :
  `orchestratorMissionHelpers.cjs` importait `missionRuntimeContext` et le
  redéclarait localement. La SyntaxError faisait échouer
  `test_ontogenesis_strategy_bridge.js`. Le correctif qui supprime l'import
  redondant est commité sur la branche de qualification dans `490f71870`;
  le test de pont ciblé passe.
- Après ce correctif, le lanceur a passé tous les contrôles jusqu'à
  `test_philosophy_ontogenesis_integration.js`, puis s'est arrêté sur
  `worktree-integration-sale` : ce test exige un worktree d'intégration propre,
  alors que les deux fichiers de documentation de la campagne n'étaient pas
  encore commitées dans le checkout de test. La suite complète doit être
  relancée après ce commit documentaire.
- Après le commit documentaire, une nouvelle exécution propre a passé le test
  du rituel et le pont stratégique, puis `test_ontogenesis_mission_verifier_receipt.js`
  a échoué par `spawnSync ... ETIMEDOUT`. À ce moment, `qwen2.5-coder:32b`
  occupait 24 Go de mémoire. Son déchargement, déjà autorisé par l'opérateur,
  a ramené la mémoire libre à 11,18 Go. La relance isolée du test de reçu passe;
  un autre lancement complet reste nécessaire pour obtenir un résultat terminal.
- Correctif `a45e13196` : restaure les fichiers candidat après tout rejet
  pré-commit tant que HEAD reste au SHA de base. La régression de fence vérifie
  que le worktree reste propre et que la reprise réussit.
- L'exécution complète a ensuite atteint `test_shev_runtime_demo.js`, mais la
  création de son dépôt temporaire a échoué faute d'espace sur `C:`. Une mesure
  a trouvé 224,85 Go libres sur `D:`; les fixtures temporaires ont été redirigées
  vers un dossier dédié sur ce volume.
- Résultat terminal de la relance depuis le checkout propre avec les dépendances
  Node installées : code 0, **46 suites passées, 54 contrôles isolés passés**,
  incluant le rituel, le pont stratégique, l'intégration philosophique avec
  fence/reprise et les trois tests SHEV liés.
- Révision du code testée : `a45e13196`. Ce relevé Windows qualifie les
  contrats locaux; il ne qualifie pas encore les missions autonomes multi-dépôts.
- Une exécution de confirmation sur `124588e08` a de nouveau échoué au test du
  rituel, car la RAM libre est repassée sous 25 %. Le test utilise maintenant
  des seuils mémoire stables dans ses configurations de fixture, sans changer
  les règles d'autorité ni les seuils du runtime. Le test isolé passe avec ce
  réglage; commit `107d84318`.
- Run 1/3 sur `f0439c412` (à froid : 20 % de RAM libre, sous admission G0) :
  45 suites/contrôles avaient passé avant l'échec de
  `test_ontogenesis_runner.js`. Le test attendait `dispatch-requiert-harnais`,
  mais la garde mémoire réelle a produit `ressources-contraintes`. Verdict code
  1; ce run ne compte pas pour G0. Le test devra isoler son état mémoire comme
  le rituel, sans changer les seuils runtime.
- Sur `7de850a29`, le test runner utilise des seuils mémoire déterministes dans
  la configuration de fixture; il passe isolément avec 17,9 % de RAM libre au
  départ. Cela ne modifie pas les seuils runtime. Le run G0 complet doit
  recommencer sur cette révision.

Conclusion du relevé : la garde mémoire a suspendu correctement un tick sous
seuil; une erreur syntaxique et un rollback incomplet ont été reproduits puis
corrigés. Le premier run complet propre est vert. Les échecs initiaux demeurent
dans le relevé et ne sont pas requalifiés rétroactivement en succès.

## Portes de qualification

### G0 — Préconditions et contrats locaux

- Exécuter `node backend/tests/run_ontogenesis_suite.js` trois fois sur la même
  révision; les trois commandes doivent terminer avec code 0.
- Commencer les campagnes avec au moins 35 % de mémoire physique libre; conserver
  la mesure avant et après chaque commande.
- Injecter les états mémoire `normal`, `constrained` et `critical` dans les tests
  de logique. Ne pas dépendre de la RAM momentanément libre de la machine pour
  vérifier le rituel.
- Résultat attendu : zéro faux succès, zéro écriture après refus, reprise exacte
  des phases persistées et conservation des preuves négatives.

### G1 — Pilote multi-dépôts isolés

Constituer trois dépôts jetables de familles différentes (JavaScript/TypeScript,
Python et Rust) avec préconditions et oracles d'acceptation indépendants. Exécuter
24 missions bornées : deux exemples de bug, petite fonctionnalité, documentation
et refactorisation par dépôt. Garder les critères d'acceptation hors du prompt de
génération et du modèle d'exécution.

Pour chaque tentative, conserver révision source, patch, commandes, sorties,
coûts, durée, modèle déclaré, décisions de reprise, verdict indépendant et SHA du
commit local. Chaque échec doit rester visible comme un résultat à part entière.

Seuils de passage pilote : au moins 80 % de réussite au premier essai, 90 % après
une reprise bornée, aucun faux succès, aucune modification hors workspace et
aucun accès non autorisé. Une fusion externe ou un déploiement restent derrière
une autorisation humaine explicite.

#### Matrice à sceller avant lancement

Les 24 identifiants ci-dessous sont le plan de missions indépendantes. À
l'exécution, chacune partira d'un dépôt jetable neuf dérivé du même modèle
d'écosystème. Le plan est 2 bugs, 2 fonctionnalités, 2 tâches de documentation
et 2 refactorisations par écosystème. Les contrats de résultat seront
fonctionnellement équivalents entre les trois langues, avec des tests et
assertions propres à chaque écosystème.

| Écosystème | Bug 1 / 2 | Fonctionnalité 1 / 2 | Documentation 1 / 2 | Refactorisation 1 / 2 |
|---|---|---|---|---|
| JavaScript/TypeScript | `js-empty-average`, `js-percentile-boundary` | `js-median`, `js-filter-above` | `js-api-reference`, `js-boundary-examples` | `js-shared-validation`, `js-summary-helper` |
| Python | `py-empty-average`, `py-percentile-boundary` | `py-median`, `py-filter-above` | `py-api-reference`, `py-boundary-examples` | `py-shared-validation`, `py-summary-helper` |
| Rust | `rs-empty-average`, `rs-percentile-boundary` | `rs-median`, `rs-filter-above` | `rs-api-reference`, `rs-boundary-examples` | `rs-shared-validation`, `rs-summary-helper` |

Les deux anomalies initiales portent sur le traitement d'une liste vide dans
`average` et sur la borne percentile `p = 100`. Les nouvelles fonctions sont
`median` et `filter_above`; les tâches de documentation décrivent les API
publiques, l'entrée vide et les bornes; les refactorisations extraient la
validation numérique partagée puis le calcul du résumé sans changer les
résultats. Les 24 contrats d'acceptation et oracles indépendants restent à
implémenter et à sceller avant le lancement. Ils seront placés dans le
contrôleur de campagne, hors du dépôt de mission et du prompt/contexte
d'exécution. L'Ontogenèse recevra le but et le contrat d'acceptation lisible,
mais pas le code des tests ni les assertions cachées.

Chaque essai utilise un clone neuf du modèle de dépôt, une base et un dossier de
preuves dédiés, un budget et une limite de temps enregistrés, et au plus une
reprise. Le premier oracle est exécuté après l'intégration locale candidate par
un processus indépendant. Une reprise réutilise les preuves d'échec utiles,
mais ne peut pas modifier l'oracle, le contrat, le modèle déclaré ou le budget.
Le contrôle post-run vérifie aussi que le seul nouveau commit est dans le clone
de mission ou son archive locale de tentative, que ses parents et ses fichiers
restent dans les racines autorisées, et qu'aucun téléversement ni fusion distante
n'a été demandé. Une réussite reçoit son commit candidat local après vérification;
un échec avec patch reçoit un commit d'archive non fusionné sur une référence
locale dédiée à la tentative. Un échec sans patch garde un reçu de tentative
commité dans le registre de preuve. Les 24 verdicts et chaque tentative
intermédiaire sont conservés; les seuils entiers sont donc
20/24 au premier essai et 22/24 après l'unique reprise, sans faux succès.

Prérequis observés sur l'hôte le 24 octobre : Node.js `v24.18.0`, Python
`3.12.10`, Cargo `1.97.1`; `D:` disposait de 207 Go libres. Ces versions et
l'identité complète du modèle restent à capturer dans le manifeste d'exécution
avant la préparation et le scellement des oracles.

Le premier appel du préparateur `prepare_ontogenesis_g1.cjs` a terminé en code 1
avant de créer le répertoire de campagne : le contrôle `path.relative` traitait
un chemin sur `D:` comme absolu lorsqu'il était comparé au checkout sur `C:`.
Le bug est dans la validation de destination; aucune fixture ni mission n'a été
créée par cette tentative. Le correctif doit vérifier le préfixe du checkout
après avoir imposé la racine autorisée sur `D:`.

### G2 — Transfert tenu à l'écart

Figer avant exécution au moins 30 missions nouvelles dans cinq dépôts ou plus et
trois écosystèmes. L'Ontogenèse ne doit pas voir les patches de référence ni les
assertions cachées. Exiger au moins 90 % d'acceptation après reprises bornées,
zéro faux succès, zéro fuite de secret, zéro sortie du workspace et une preuve
indépendante pour chaque réussite. Publier l'intervalle d'incertitude; si la
couverture est trop faible pour conclure, le verdict reste inconclusif.

### G3 — Pannes, budgets et durée

Injecter arrêt brutal du worker à chaque frontière persistée, réponse perdue
après commit, claim concurrent, lease expiré, manque mémoire, indisponibilité du
modèle et preuve invalide. Exiger absence de double écriture, reprise idempotente,
respect des budgets et classement correct du motif d'échec.

Enfin, maintenir une campagne pilote pendant sept jours ou 100 missions, selon
le dernier seuil atteint. Publier réveils, `NO_CHANGE`, coûts, interventions,
échecs, rollbacks et stabilité du runner. Aucun taux d'autonomie général ne sera
revendiqué avant ce relevé.

## Ordre d'exécution

1. Stabiliser l'environnement de test et rendre les tests de pression mémoire
   déterministes sans réduire les gardes du runtime.
2. Obtenir trois exécutions G0 complètes avec code 0 et résultats archivés.
3. Préparer les trois dépôts jetables, leurs tests cachés et la graine de campagne;
   sceller les oracles avant la première mission.
4. Exécuter G1, garder chaque tentative et classer les échecs (produit,
   environnement, oracle ou capacité insuffisante).
5. Corriger uniquement les causes reproduites, puis rejouer les mêmes cas et les
   contrôles de régression avant G2.
6. N'élargir les permissions qu'après G1/G2; conserver la validation humaine pour
   les effets externes irréversibles.

## Blocage ouvert

G0 doit repartir sur le code actuel, révision `fe7ef6b69`. Les anciens runs
complets sur l'arbre `7de850a29` (un à 49,2 % de RAM libre, un à 34,2 % et donc
non qualifiant) précèdent le durcissement de l'environnement du vérificateur
`3755dd29f`; ils ne couvrent pas ce code et ne comptent pas pour G0. Le test
isolé de non-transmission des secrets passe sur le code actuel. La RAM libre
était à 18,8 % au dernier contrôle, avec les modèles 14B et 7B chargés; le
seuil d'admission G0 reste 35 % et aucun nouveau run complet n'a été lancé.

G1 est préparé mais non scellé. Le dossier
`D:\GenOS-runs\ontogenesis-g1-2026-10-24` contient 24 dépôts propres dérivés des
fixtures, leurs configurations et oracles séparés; l'état est
`prepared-not-run`, les oracles `unverified`, et le registre de reçus a le commit
`19c0c68`. Le générateur a d'abord échoué avant écriture sur une comparaison de
chemins entre `C:` et `D:`, puis le correctif a préparé les 24 dépôts sans
checkout sale.

Le pilote ne doit pas exécuter le code candidat sur cet hôte sans confinement OS.
La vérification élimine désormais les secrets de l'environnement enfant, mais
un worktree et un Job Object ne confinent pas les accès disque/réseau du code
exécuté. Docker répond avec client `29.5.3`, mais le moteur Linux nommé
`dockerDesktopLinuxEngine` est indisponible; l'hôte est Windows 10 Home. Il faut
un runner isolé (VM ou conteneur réellement disponible), sans secrets et avec
réseau bloqué, avant de sceller les oracles et d'ouvrir G1. Les échecs mémoire,
timeout, checkout sale et manque d'espace antérieurs restent consignés.
