# Expériences NCE exécutables

## Portée

Le chemin `nceCausalCycleService` ferme la boucle recherche → exécution →
vérification → transfert → phénotype → réutilisation pour des transformations
numériques. Il utilise de vrais processus Node, les snapshots POET et SQLite.
Aucun fournisseur LLM ni remplacement du runtime par une doublure n'est requis
par `test_nce_native_cycle.js` et `test_nce_executed_ablation.js`.

Les familles disponibles sont `ascending`, `unique-ascending` et
`absolute-ascending`. Le générateur fournit des entrées déterministes et un
vérificateur protégé. Il ne génère pas de tâches ouvertes arbitraires.

## Lancer un cycle

Utiliser une base GenOS initialisée ou définir `GENOS_ADMIN_PASSWORD` dans
l'environnement avant le premier démarrage, conformément au bootstrap du backend.

Configuration JSON, depuis la racine du dépôt :

```json
{
  "root": ".genos-agent-worlds/nce-campaign",
  "databasePath": ".genos-agent-worlds/nce-campaign/state.db",
  "agentId": "nce-learner",
  "runId": "learning-001",
  "family": "unique-ascending",
  "seed": 41,
  "count": 2,
  "timeoutMs": 30000
}
```

```bash
node backend/bin/genos-nce-experiment.cjs cycle config.json .genos-agent-worlds/report.json
```

Le fichier de rapport doit être nouveau. Les environnements, snapshots et la base
sont conservés pour inspection. Ces fichiers générés ne doivent pas être commités.
Un `runId` identique rejoue le reçu sauvegardé sans répéter l'apprentissage. Une
requête différente avec le même identifiant est refusée.

## Procédures et acquisition

Un programme `genos.nce.procedure.v1` contient au plus 16 étapes parmi `sort`,
`unique`, `absolute`, `reverse`. L'entrée contient au plus 4096 nombres finis.
Le processus enfant reçoit uniquement le programme et les valeurs, sans solution
attendue. Il n'évalue aucun code fourni et n'invoque aucun outil MCP. Le parent
écrit `solution.json` dans le workspace isolé. POET vérifie le snapshot et
l'intégrité de `package.json`, du vérificateur et des données d'entrée.

Les candidats sont choisis sur training. Le candidat sélectionné est figé avant
held-out. La procédure initiale est évaluée séparément sur le même split. La
promotion exige une mesure complète, un gain held-out strictement positif et
aucune régression training. Une terminaison seule ne suffit pas. Les cas sans
gain et les échecs d'exécution sont conservés.

Le reçu expose les scores, sorties des vérificateurs, hashes d'artefacts et de
snapshots, programme, provenance, durée et vecteurs structurels avant/après.
`evidenceRef` identifie la mesure scellée ; `transitionEvidenceRef` lie cette
mesure à la transition de phénotype. Programme, répertoire, tradition et reçu
sont écrits dans la même ligne `agent_phenotype_states`, avec contrôle de révision.

Pour enseigner une procédure, fournir `artifacts: [receipt.transmittedArtifact]`
et éventuellement `features: {play: false}` à `runCausalCycle(input, db)`.
La nouvelle transmission conserve le parent, la racine culturelle et les agents
de la lignée. Le service `executeLearnedProcedure(db, {agentId, values})` recharge
la procédure persistée et exige un reçu de promotion avant de l'exécuter.
La sortie de cette exécution ne constitue pas à elle seule une nouvelle preuve
de réussite sur une tâche utilisateur.

Le point d'entrée `enhanceMissionWithNCE` accepte `mission.nceExperiment`
contenant `runId`, `split`, `artifacts` et `timeoutMs`. Les options NCE commandent
les quatre mécanismes du cycle. Les erreurs figurent dans `errors.causalCycle`.

## Vecteur créatif

`genos.creative-phenotype.v1` complète `genos.phenotype.v3` sans changer son format.
Chaque dimension a une valeur dans [0,1], un masque `known` et une référence de
preuve. Une valeur absente est inconnue, même si sa case numérique contient zéro.

| Dimension | Mesure opérationnelle du cycle |
| --- | --- |
| N | Programme choisi absent des reçus antérieurs de cet agent |
| Q | Taux de réussite held-out du programme choisi |
| S | Valeur absolue du changement de taux de réussite |
| D | Proportion de programmes candidats distincts |
| T | Partie positive du gain held-out ; le delta signé reste dans le reçu |
| E | `1000 / (1000 + durée_ms)` ; indice de latence, sans coût monétaire implicite |
| O | Inconnue sans mesure externe de nouvelles possibilités |
| H | Inconnue sans mesure externe de transmission répétée |

Le constructeur accepte aussi des mesures O/H explicitement sourcées. Ces indices
sont des définitions locales versionnées, pas une mesure universelle de créativité.

## Ablations exécutées

```bash
node backend/bin/genos-nce-experiment.cjs ablation config.json .genos-agent-worlds/ablation.json
```

Ajouter `campaignId` et `seeds: [41,83]` à la configuration. Les six bras sont
`baseline`, `withoutPlay`, `withoutCulture`, `withoutPhenotype`, `withoutPoet`,
`full`. L'ordre est déterministe par graine ; chaque bras dispose d'un agent et
d'un état indépendants. Le split est partagé et chaque exécution est isolée.
Sans recherche POET, seul le premier artefact proposé est candidat à l'acquisition ;
la comparaison au programme initial et le vérificateur restent obligatoires.

Le rapport contient toutes les observations, y compris les zéros et erreurs,
les comparaisons appariées baseline/full, la moyenne et l'erreur standard
des paires mesurées. Les coûts de recherche sont observés, pas égalisés entre bras.
L'erreur standard n'est pas un test de significativité.

La campagne de régression à deux graines fournit une procédure correcte au départ.
Le gain est alors nul sans culture ou sans phénotype, et positif en FULL, sans
Play ou sans recherche POET. Elle démontre le câblage causal de ce cas contrôlé,
sans démontrer que tous les moteurs apportent un gain ni couvrir les 25 mécanismes
conceptuels. `nceAblationTests.js` reste une simulation distincte.

## Vérification

```bash
npm --prefix backend run test:nce
npm --prefix backend run test:nce:cli
```

Cette suite couvre les contrats historiques, snapshots Play, budgets nuls,
rollback culturel, scores invalides, intégrité POET, séparation des splits,
procédures natives, acquisition inter-agent, reprise SQLite et ablations réelles.
Les benchmarks historiques de `culturalLearningService` sont marqués
`heuristic-estimate` et `measured: false`.
