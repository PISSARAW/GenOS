# Plan de lancement — mesure de l’apport de GenOS

Ce plan prépare une campagne de comparaison `alone` / `genos` pour les six
familles demandées. Il ne transforme pas les anciens résultats en baseline et
ne lève pas les statuts `design_required` : les corpus, modèles et oracles doivent
être matérialisés et vérifiés avant le premier run confirmatoire.

## Contrat commun de campagne

Chaque observation est un enregistrement versionné conforme à
[`schemas/benchmark-run.schema.json`](schemas/benchmark-run.schema.json).
Une paire est identifiée par tâche et répétition; ses deux bras partagent le
même modèle servi, le même harness, les mêmes paramètres, l’entrée, le snapshot
d’environnement, les outils et les budgets. Seul `mode` change. L’ordre des
bras est tiré au sort avec une graine archivée. Les erreurs, échecs et mesures
indisponibles sont conservés (`finalOutcome: error` ou `null`), jamais retirés
du dénominateur.

Avant de compter une suite comme confirmatoire, produire au minimum trois
répétitions appariées par tâche, avec résultats bruts, reçu d’oracle et empreinte
des actifs. Publier aussi les différences appariées et leurs intervalles de
confiance; une absence de preuve ou un échantillon insuffisant donne
« inconclusif », pas une victoire. Verrouiller le commit GenOS, le protocole, le
modèle réellement servi, les budgets et les versions de toutes les dépendances
avant la collecte. Ne pas comparer des runs de modèles ou de versions différents.

## Périmètre des six suites

| Suite demandée | Manifeste(s) existant(s) | Protocole à figer | Oracle indépendant requis |
| --- | --- | --- | --- |
| Coding | [`suites/coding/suite.json`](suites/coding/suite.json) | Cohorte pilote des 26 tâches historiques épinglée dans [`suites/coding/dataset.lock.json`](suites/coding/dataset.lock.json). Exécuter patches et tests SWE sous WSL Ubuntu 24.04, sans Docker; figer par tâche l’interpréteur et les dépendances de test. Les bras partagent le même checkout, modèle, budget et vérificateur. | Les `FAIL_TO_PASS` doivent échouer avant le correctif puis réussir après; tous les `PASS_TO_PASS` doivent réussir. Conserver sortie pytest et empreinte de l’environnement. Un patch de référence sert uniquement à calibrer l’environnement, jamais comme résultat du modèle. |
| Recherche factuelle | [`suites/factual_research/suite.json`](suites/factual_research/suite.json) | Constituer un corpus local immuable de documents datés et hachés; figer questions, réponses attendues, assertions atomiques et budget de recherche. Interdire toute source hors corpus pour éviter la dérive du Web. | Résolution mécanique des identifiants de citation et des extraits, puis annotation à l’aveugle de la prise en charge de chaque assertion. Un score lexical seul ne suffit pas. |
| Mathématiques formelles | [`suites/formal_math/suite.json`](suites/formal_math/suite.json) | Figer problèmes, énoncés, imports, versions du vérificateur et limites d’exécution. Exiger un artefact de preuve compilable pour chaque réponse comptée. | Vérificateur de preuves déterministe et versionné; aucune appréciation LLM ne valide un théorème. |
| Planification sous contraintes | [`suites/planning/suite.json`](suites/planning/suite.json) et [`suites/constraints/suite.json`](suites/constraints/suite.json) | Traiter `planning` et `constraints` comme deux sous-domaines d’une même campagne à six familles. Versionner les environnements, états initiaux, graines, actions autorisées, contraintes dures et budgets; réinitialiser l’environnement avant chaque bras. | Exécuteur/validateur des contraintes sur la trace d’actions complète, avec reçu comprenant contraintes satisfaites, violations et coût. Le score du plan seul ne suffit pas. |
| Analyse de dépôts | [`suites/repository_analysis/suite.json`](suites/repository_analysis/suite.json) | Épingler les dépôts par commit et snapshot sans réseau; figer questions, fenêtres temporelles et barème des constats, incluant les abstentions. Les évaluateurs ne voient ni le bras ni l’identité du modèle. | Référentiel de constats vérifiables et double notation indépendante à l’aveugle; résoudre les désaccords selon une règle préétablie. |
| Récupération d’agents | [`suites/agent_recovery/suite.json`](suites/agent_recovery/suite.json) | Construire des états de panne déterministes à partir de snapshots propres; fixer injection, graine, limites de ressources et état initial pour chaque répétition. | Contrôles indépendants des invariants avant/après, plus tests de non-régression et reçu de reprise. Une déclaration de succès de l’agent ne vaut pas preuve. |

La demande parle de six suites alors que le dépôt a sept manifestes. Pour garder
le compte demandé, `planning` et `constraints` sont ici deux sous-domaines d’une
même campagne; conserver leurs actifs séparés jusqu’à décision contraire.

## Séquence de lancement

1. **Figer la cohorte et les oracles.** Ajouter dans chaque manifeste la version
   du protocole, le chemin d’un jeu d’items immuable, la version de l’oracle et
   l’empreinte SHA-256 des fichiers. Les éléments incomplets restent exclus.
2. **Choisir l’environnement de collecte.** Enregistrer fournisseur et ID du
   modèle, version servie, paramètres, image/runtime, outils permis, budgets,
   coûts maximaux et emplacement append-only des traces. Ces choix ne sont pas
   définis dans le dépôt à ce jour.
3. **Faire un pilote technique non confirmatoire.** Exécuter une tâche par
   sous-domaine et par bras; valider le reset, l’appariement, la collecte des
   métriques et les reçus d’oracle. Marquer le pilote comme tel et ne pas le
   mélanger aux répétitions confirmatoires si un protocole change.
4. **Geler la version confirmatoire.** Valider au moins trois répétitions
   appariées par tâche, randomisation reproductible et complétude des reçus.
   Toute modification du corpus, du modèle, du harness ou de l’environnement
   crée une nouvelle version de campagne.
5. **Analyser sans surinterpréter.** Produire un rapport par suite et un rapport
   agrégé qui montre les paires, exclusions préenregistrées, échecs, coûts,
   latences, intervalles de confiance et limites de portée. Aucune promotion
   GenOS ne découle automatiquement d’un score de benchmark.

## Blocages avant le premier lancement

- Les sept manifestes restent `design_required`. L’analyse de dépôts dispose
  maintenant d’un pilote de quatre questions, snapshot et oracle exacts versionnés
  dans `suites/repository_analysis/v1/`. Un run exploratoire Qwen2.5 Coder 7B
  `alone` note 0,28125/1; le bras GenOS est bloqué avant inférence par une porte
  de portfolio sans phase exécutable. Aucun résultat apparié n’en découle.
- **Préflight du 3 octobre 2026 :** Ollama répond localement et expose des
  modèles installés (`qwen2.5-coder:7b`, `deepseek-coder-v2:latest`,
  `deepseek-r1:latest`, entre autres). Aucun modèle commun n’a été sélectionné.
  Le split officiel de 300 tâches SWE-bench Lite a été téléchargé et déplacé
  vers `D:/GenOS/benchmarks-data/SWE-bench`; son SHA-256 et la cohorte des 26
  tâches (3 Flask, 6 Requests, 17 pytest) sont épinglés dans
  [`suites/coding/dataset.lock.json`](suites/coding/dataset.lock.json). Les
  trois dépôts sont clonés sur D. WSL Ubuntu 24.04 et Python 3.9/3.12 servent
  aux tests directement, sans Docker. Le runner exécute pytest par
  `python -m pytest`, désactive les plugins tiers implicites et échappe les
  sélecteurs comme arguments shell. Les calibrations au patch de référence
  confirment reproduction, résolution et régression pour cinq tâches sur 26 :
  Flask 4045/4992, Requests 1963/3362 et pytest 9359. Ce contrôle
  d’environnement n’est pas un score de modèle. Les autres tâches échouent ou
  restent non validées : régressions dans les profils historiques, sélecteurs
  de tests paramétrés incomplets dans certaines lignes du corpus, ou délais
  dépassés. Le runner apparié `alone`/`genos` et les reçus complets ne sont pas
  implémentés. Les cinq autres familles restent en conception;
  `planning-gap` n’est pas un run apparié conforme au protocole commun.
- Le code SWE a plusieurs chemins : le runner fleet appelle une orchestration
  qui peut exécuter `FAIL_TO_PASS` / `PASS_TO_PASS` via pytest sous WSL, tandis
  que `swe_eval_engine.js` contient aussi un chemin qui ne valide que la
  syntaxe. Aucun de ces chemins ne fournit encore le protocole commun apparié
  avec environnement et reçus entièrement épinglés. Le rapport historique
  annonce 9/26 sur une cohorte partielle, sans bras `alone` correspondant.
  Garder ce chiffre comme contexte descriptif uniquement.
- Les suites planification et récupération n’ont pas encore de corpus/oracle
  versionné pour ce protocole. La recherche factuelle et les mathématiques
  formelles disposent désormais de pilotes exploratoires, sans campagne
  appariée confirmatoire. L’analyse de dépôts doit encore
  réparer la porte d’exécution GenOS, ajouter le runner apparié et l’adjudication
  indépendante à l’aveugle.
- Le modèle commun, les budgets, les images/runtime et les plafonds de coût
  restent à choisir avant de pouvoir construire et exécuter une campagne.

## Décision de lancement

**État : préparation de protocole; lancement confirmatoire bloqué par les
actifs manquants.** Démarrer par l’implémentation du runner commun et la
matérialisation des jeux/oracles. Ne passer un manifeste à un état prêt que
lorsqu’un pilote démontre un run apparié complet et que son reçu indépendant est
vérifiable. Ne pas réutiliser les prédictions ni les scores historiques comme
bras GenOS dans la nouvelle campagne.

## Plan d’exécution « GenOS réel » — quatre suites sans Docker

Ce plan vise les quatre suites retenues sans Docker : recherche factuelle,
mathématiques formelles, planification et analyse de dépôts. Une invocation
acceptée ou une réponse produite par un LLM ne suffit pas : le bras GenOS doit
montrer que l’orchestrateur, ses workers, leurs contrats et la barrière de
preuves ont effectivement participé au résultat.

### 1. Valider le chemin cognitif avant toute collecte

1. Utiliser d’abord `executor: "codex"`, `background: false` et un budget borné.
   La documentation d’intégration indique que `caller_mcp` nécessite MCP
   Sampling, absent de l’hôte utilisé lors du pilote; elle recommande `codex`
   sur un hôte Codex sans Sampling natif. Ne pas relancer `caller_mcp` tant qu’un
   broker Sampling n’est pas confirmé disponible.
2. Faire une mission minuscule en workspace dédié et relever son modèle réel,
   son provider, ses paramètres, son budget, la version/empreinte du runtime et
   les identifiants de mission, orchestrateur et exécution.
3. Exiger une trace montrant la génération cognitive via GenOS, les appels MCP
   effectivement servis par GenOS et une réponse finale passée par son
   validateur. Une déclaration de succès seule est un échec de préflight.
4. Corriger le dispatch A-Team jusqu’à obtenir des états terminaux, les artefacts
   des workers et un reçu de la barrière. `accepted`, un `teamRunId` ou des
   affectations prévues ne prouvent pas que les workers ont exécuté leur travail.

**Porte de sortie :** run terminé et rejouable, appels requis couverts,
artefacts avec provenance, vérification indépendante réussie. Sinon, arrêt du
pilote et classement `error` ou `incomplete`, sans score.

### 2. Vérifier morphogenèse, huit topologies et types de workers

La vérification de conformité est une campagne technique distincte des scores
des tâches. Tester séparément les huit topologies documentées : `a_team`,
`trinity`, `rhizome`, `biome`, `metapopulation`, `syncytium`, `biocenose` et
`holobionte`. Pour chacune, exécuter une tâche jouet déterministe, réinitialisée
entre essais, et archiver la topologie demandée, proposée, validée, puis réellement
utilisée, ainsi que les agents enfants créés et leurs événements d’exécution.

Pour chaque worker, vérifier le type résolu par le runtime (pas seulement le rôle
ou le type demandé), le contrat reconstruit, le bail d’outils effectif, les
budgets, les artefacts typés, la provenance et le verdict de la barrière. Tester
les types requis par chaque topology et inclure au minimum un worker de
vérification indépendant. Les topologies documentées comme partielles restent
marquées partielles si elles échouent à un de ces contrôles.

Pour la morphogenèse, distinguer explicitement `MORPHOGENESIS_PROPOSED` de
`MORPHOGENESIS_COMPLETED` et de l’affectation exécutée. Un run de benchmark ne
revendique une morphogenèse effective que si la proposition est validée,
qu’une topologie est engagée et que ses workers sont observés en exécution.
Conserver les cas de refus/abstention comme résultats de conformité, pas comme
succès d’exécution.

**Porte de sortie :** matrice de huit reçus exécutables; chaque ligne indique
`pass`, `partial` ou `blocked`, avec événements, kinds, contrats, preuves et
limites. Aucune agrégation ne masque une topologie manquante.

### 3. Construire le harness apparié commun

Pour chaque tâche, produire deux bras à partir du même snapshot et de la même
graine : `alone` (le LLM répond via le harness sans orchestrateur/worker GenOS)
et `genos` (la mission passe par l’orchestrateur GenOS). Épingler le même modèle
réel, sa version, les paramètres, le budget, le timeout, les outils disponibles
et les actifs. Randomiser l’ordre des bras; garder les erreurs dans les données.
L’oracle est le même pour les deux bras et ne reçoit pas l’identité du bras.

Le reçu `genos` doit joindre au reçu commun les identifiants de mission,
orchestrateur, exécution et workers, la morphogenèse et la topologie réellement
engagées, les kinds et contrats effectifs, les outils appelés, les artefacts,
les dépenses et le verdict indépendant. Le reçu `alone` doit prouver que les
capacités propres à GenOS (orchestration, workers et mémoire de mission) n’ont
pas été invoquées. Toute paire qui diffère sur modèle, budget, environnement,
oracle ou version est invalide.

### 4. Lancer les suites une par une

1. **Recherche factuelle** — corpus local figé; mesurer exactitude des assertions,
   qualité des citations, abstentions, coût et latence. Oracle des citations puis
   adjudication aveugle.
2. **Mathématiques formelles** — problèmes figés; demander un artefact compilable
   et le vérifier avec le vérificateur déterministe épinglé. Le texte explicatif
   ne compte pas comme preuve.
3. **Planification** — commencer par Blocks World, puis élargir aux contraintes
   épinglées; rejouer chaque action dans l’environnement et noter validité,
   violations, coût et réussite finale. Une sortie syntaxiquement plausible ne
   compte pas sans trace d’exécution.
4. **Analyse de dépôts** — snapshots et questions fixes; réponses vérifiées
   contre les faits du dépôt par deux évaluateurs indépendants à l’aveugle.

Pour chaque suite : vérifier les actifs et l’oracle, un pilote `alone` puis un
pilote `genos`, réparer le harness jusqu’à deux reçus valides, geler le protocole,
puis seulement collecter au moins trois répétitions appariées par tâche. Ne pas
passer à la suite suivante tant que le pilote courant ne franchit pas sa porte.

### 5. Décision et rapport

Publier les paires, reçus d’oracle, échecs, abstentions, coûts et latences, ainsi
que les différences appariées et leurs intervalles de confiance. Séparer les
résultats par suite et par topologie réellement engagée. Une hausse de score
sans preuve d’exécution des mécanismes GenOS ne mesure pas l’apport de GenOS;
une couverture incomplète, un worker sans résultat ou un oracle absent invalide
la paire. Les anciens pilotes restent hors de l’analyse confirmatoire.
