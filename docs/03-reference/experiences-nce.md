# Expériences NCE exécutables

- **Dernière revue** : 2026-10-06
- **Décision** : [ADR 0323](../adr/0323-nce-procedures-et-preuves-executables.md)

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
Pour un même agent, un `runId` identique rejoue le reçu sauvegardé sans répéter
l'apprentissage si la requête est identique. L'empreinte inclut les mécanismes,
les artefacts culturels, le contenu des partitions, le délai normalisé et les
contrats de vérification (`verifierCommand`, `protectedPaths`, `artifactPath`).
Toute modification de ces éléments avec le même identifiant est refusée.

La CLI génère les environnements avant ce contrôle : un replay peut donc créer
de nouveaux workspaces sans réexécuter l'apprentissage. L'écriture du rapport
suit la sauvegarde SQLite ; un refus d'écraser le rapport n'annule pas le cycle
déjà persisté. Relancer la même requête avec un chemin de rapport neuf.

| Paramètre | Contrat |
| --- | --- |
| `root`, `databasePath` | Chemins explicites, résolus depuis le répertoire courant ; créer le parent de la base s'il diffère de `root` |
| `agentId`, `runId` | Chaînes non vides pour un cycle |
| `family` | Une des trois familles documentées |
| `seed` | Entier sûr pour le générateur du cycle |
| `count` | 1 à 20 environnements par partition ; défaut 2 |
| `timeoutMs` | Délai par tentative POET ; défaut 30 000 ms, pas une limite globale du cycle |

La CLI ouvre une base avec les migrations du backend. Le cycle enregistre son
sujet expérimental dans `agents` avant de persister son phénotype ; le générateur
utilise des identifiants et noms de workspaces uniques. Les contraintes de clés
étrangères et d'unicité restent actives.

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
aucune régression training, avec culture et phénotype activés. Une terminaison
seule ne suffit pas. Les cas sans
gain et les échecs d'exécution sont conservés.

Le reçu expose les scores, sorties des vérificateurs, hashes d'artefacts et de
snapshots, programme, provenance, durée et vecteurs structurels avant/après.
`evidenceRef` identifie la mesure scellée ; `transitionEvidenceRef` lie cette
mesure à la transition de phénotype. Programme, répertoire, tradition et reçu
sont écrits dans la même ligne `agent_phenotype_states`, avec contrôle de révision.

Après une promotion (`promoted: true`), le reçu fournit `transmittedArtifact`.
Pour enseigner cette procédure, fournir `artifacts: [receipt.transmittedArtifact]`
et éventuellement `features: {play: false}` à `runCausalCycle(input, db)`.
La nouvelle transmission conserve le parent, la racine culturelle et les agents
de la lignée. Le service `executeLearnedProcedure(db, {agentId, values})` recharge
la procédure persistée et exige un reçu de promotion avant de l'exécuter.
La sortie de cette exécution ne constitue pas à elle seule une nouvelle preuve
de réussite sur une tâche utilisateur.

Le point d'entrée `enhanceMissionWithNCE` utilise `mission.agentId` et accepte
`mission.nceExperiment` contenant `runId`, `split`, `artifacts`, `features` et
`timeoutMs`. Il recharge `mission.phenotypeState` après sauvegarde. Le résultat
est dans `causalCycle` et les erreurs dans `errors.causalCycle`.

Les mécanismes sont actifs par défaut. Un `false` dans `features` ou dans
l'option de mission correspondante suffit à les désactiver ; l'expérience ne
peut pas réactiver un mécanisme interdit par les options issues de la topologie.

| `features` | Option `mission.nceOptions` | Effet d'une désactivation dans ce cycle |
| --- | --- | --- |
| `play` | `play` | Supprime les six programmes prédéfinis ; les artefacts fournis restent candidats |
| `culture` | `culture` | Évalue uniquement la procédure initiale et interdit la promotion |
| `phenotype` | `phenotype` | Évalue uniquement la procédure initiale et interdit la promotion |
| `poet` | `envCoev` | Limite la recherche au premier artefact proposé, en plus de la procédure initiale ; conserve les vérifications |

Dans ce chemin, Play désigne une recherche bornée dans un catalogue de programmes.
Le parcours historique `runPlaySession` dispose de ses propres snapshots et tests.
Le cycle accepte au plus 32 artefacts candidats avant déduplication.

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

Ajouter `campaignId` et `seeds: [41,83]` à la configuration. Une campagne accepte
1 à 20 graines entières distinctes. Ses identités de sujets et de cycles sont
dérivées de `campaignId`, de la graine et du bras ; utiliser un nouvel identifiant
pour une nouvelle campagne. Les champs `agentId`, `runId` et `seed` du mode cycle
ne déterminent pas ces identités. Les six bras sont
`baseline`, `withoutPlay`, `withoutCulture`, `withoutPhenotype`, `withoutPoet`,
`full`. L'ordre est déterministe par graine ; chaque bras dispose d'un agent et
d'un état indépendants. Le split est partagé et chaque exécution est isolée.
Sans recherche POET, seul le premier artefact proposé est candidat à l'acquisition ;
la comparaison au programme initial et le vérificateur restent obligatoires.

Le rapport contient les observations retournées par les cycles, y compris les
zéros et les erreurs d'exécution rapportées par POET,
les comparaisons appariées baseline/full, la moyenne et l'erreur standard
des paires mesurées. Les coûts de recherche sont observés, pas égalisés entre bras.
L'erreur standard n'est pas un test de significativité. Une paire non mesurée
porte `delta: null` et reste dans le rapport ; elle n'entre pas dans la moyenne.
`measuredPairs` donne le dénominateur effectivement observé. Le succès de la CLI
signifie que le rapport a été écrit, pas qu'une procédure a été promue.
Un refus de validation des entrées ou une erreur de persistance peut interrompre
la campagne avant le rapport final ; les cycles déjà sauvegardés restent en base.

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

### État de validation de la livraison

Bilan repris des exécutions ayant accompagné les commits `02d72271`,
`8e822d9b` et `71709af7`, revu le 2026-10-06 :

| Vérification | Résultat et portée |
| --- | --- |
| `test:nce` | Suite passée avant les derniers ajustements des identités de production ; tests natifs, CLI et ablations concernés rejoués ensuite |
| `test_nce_native_cycle.js` | Passé après le durcissement de l'empreinte de replay |
| `test:nce:cli` | Passé avec migrations, bootstrap et contraintes SQLite de production |
| `test_nce_executed_ablation.js` | 12 cas passés : six bras × deux graines ; délai du test fixé à 90 000 ms pour tous les bras après un dépassement à 30 000 ms |
| `npm test` depuis la racine | Passé pendant la livraison ; ne remplace pas les commandes NCE dédiées |
| Qualité sur les fichiers source NCE modifiés | Aucune nouvelle violation |
| Contrôle qualité global du dépôt | Non validé : violations encore signalées hors du périmètre NCE corrigé |
| `cargo test --workspace` | Interrompu à l'édition de liens par manque d'espace disque ; validation Rust complète indisponible |

Le délai du test d'ablation ne modifie pas le défaut de production de 30 000 ms.
Un dépassement de délai reste une observation non mesurée, sans promotion. Ce
bilan ne certifie ni tous les chemins du dépôt, ni les 25 mécanismes conceptuels,
ni un avantage scientifique général.
