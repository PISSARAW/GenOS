# Physique computationnelle — mesures du workspace et contrôle des décisions

- **Statut** : implémenté dans la boucle Rust `tick()` et `run()`.
- **Dernière revue** : 2026-10-06.
- **Portée** : acquisition bornée, contexte de décision, dépendances, couverture,
  coûts observés, calibration persistante par type de mission et politique physique.
- **ADR** : [0327](../adr/0327-mesures-et-calibration-physique.md).

## 1. Fonctionnement

`tick()` observe le monde, collecte ou réutilise les mesures du workspace,
mesure son entrée de décision, calcule `PhysicalState`, explore les plans avec
leurs coûts physiques, applique les régimes et l'inertie, puis exécute le plan.
Les opérations exécutées consomment l'ATP du registre métabolique réel.

`run()` ouvre un épisode et mesure les durées des actions et de la mission.
La réussite utilisée pour la calibration vient de `observe().goal_reached()`
après l'exécution. Une prédiction du plan ne constitue pas cette observation.

Les champs physiques sont des indices de contrôle bornés dans `[0,1]`.
Leurs noms ne confèrent aucune unité thermodynamique. Les compteurs, octets,
durées et arêtes sont des observations; leur normalisation reste une politique
heuristique. Aucun résultat de cette couche ne remplace une preuve de promotion.

## 2. Contrat de mesure

Chaque `Measurement<T>` porte une valeur optionnelle, une source, un horodatage,
un état et un diagnostic optionnel.

| État | Sens | Utilisation |
| --- | --- | --- |
| `Measured` | Observation valide dans le périmètre déclaré | Politique et calibration |
| `Partial` | Limite atteinte ou résolution incomplète | Politique bornée; graphe exclu de la calibration |
| `Missing` | Source absente ou inaccessible | Aucun zéro inventé |
| `Invalid` | Contenu invalide | Valeur exclue |
| `Stale` | Rapport périmé ou source plus récente | Valeur exclue |

### Workspace

L'inventaire mesure le nombre de fichiers, leurs tailles et dates de modification.
Il exclut les dossiers cachés et les sorties `target`, `node_modules`,
`coverage`, `dist`, `build`. Il ne traverse pas les liens symboliques.

Les limites par défaut sont 30 000 entrées, 32 niveaux, 500 ms par scan,
2 Mo par fichier lu et 32 Mo de lectures pour les dépendances.
Un scan interrompu reste explicitement partiel. Les documents lus sont confinés
au workspace, y compris après résolution des liens.

### Contexte

Sans entrée supplémentaire, le runtime mesure les octets du JSON effectivement
remis à la décision : `WorldState`, `Goal` et les caractéristiques du directeur.
Cela couvre davantage que le seul vecteur de caractéristiques.

L'appelant peut fournir le contexte réel du modèle et ses compteurs de tokens :

```rust
use genos_orchestrator::physical_measurements::{
    ContextUsage, EvidenceDebt, WorkspacePhysicsConfig,
};

eco.physics.config = WorkspacePhysicsConfig::for_root(workspace);
eco.physics.set_context_usage(
    ContextUsage {
        bytes: serialized_prompt.len(),
        tokens: Some(provider_input_tokens),
        capacity_tokens: Some(model_context_capacity),
    },
    "provider usage receipt",
)?;
eco.physics.set_evidence_debt(
    EvidenceDebt { outstanding: 2, required: 5 },
    "mission evidence obligations",
)?;
let report = eco.tick(&goal);
```

Ces entrées valent pour la prochaine décision et doivent être renouvelées.
Le runtime ne déduit pas de tokens à partir d'un ratio arbitraire d'octets.
Les valeurs fournies restent des déclarations sourcées de l'appelant.

### Dépendances et gravité

Les manifests Cargo TOML et npm JSON sont analysés dans tous les sous-projets
inventoriés. Les dépendances directes, de développement, optionnelles et ciblées
sont dédupliquées par manifest.

Le graphe distinct des imports locaux utilise un AST Rust (`syn`) et une
analyse des tokens des imports statiques JS/TS. Les commentaires et chaînes
ordinaires ne deviennent pas des imports. Les cibles locales résolues donnent
des arêtes fichier → fichier et une gravité proportionnelle aux imports entrants.

Ce périmètre ne représente pas le graphe complet du compilateur : macros,
imports JS construits dynamiquement, alias de bundler, modules Rust inline et
résolution inter-crates ne sont pas intégralement résolus. Les imports locaux
non résolus rendent la mesure partielle. Les références externes sont comptées
séparément. Les fonctions de résolution ne sortent jamais de l'inventaire.

### Couverture

Les rapports `coverage/lcov.info`, `backend/coverage/lcov.info`,
`coverage/coverage-final.json` et `backend/coverage/coverage-final.json`
sont reconnus; la liste est configurable.

LCOV déduplique les lignes et branches répétées. Istanbul déduplique les lignes
de début des instructions et mesure les branches. Le rapport le plus récent
valide est retenu. Une absence de rapport reste une absence de mesure.

Un rapport vieux de plus de 24 h, ou plus ancien qu'une source qu'il couvre,
est exclu. Une date anormalement future, un compteur invalide ou un chemin hors
workspace n'est pas accepté comme preuve de couverture. La couverture ne
prouve ni la qualité des assertions ni la couverture de tous les fichiers.

### Git, CI et cache

Git est interrogé en lecture seule avec délai et plafond de sortie : fichiers
suivis modifiés et branches locales. Les renommages comptent une seule fois.
Un dépôt Git absent ne produit pas un compteur nul.

`CI_BUDGET_REMAINING` / `CI_BUDGET_TOTAL` peuvent limiter l'énergie disponible.
Les variantes `GITHUB_RUN_ATTEMPT_REMAINING` / `GITHUB_RUN_ATTEMPT_TOTAL`
restent reconnues. Les valeurs non finies ou incohérentes sont ignorées.

Le workspace est mis en cache pendant 5 s; le contexte est renouvelé par décision.
`eco.physics.invalidate_workspace()` force une nouvelle acquisition.
Changer de racine réinitialise cache, mémoire physique et profils du workspace précédent.

## 3. Politique physique

`PhysicalState` contient énergie, entropie, friction, inertie, pression,
température, viscosité, élasticité, plasticité, risque de rupture, résonance,
gravité structurelle et dette de preuve.

Les indices sont dérivés de `WorldState`, enrichis uniquement des mesures
utilisables, puis bornés. La couverture faible ajoute un risque limité;
le budget CI peut réduire l'énergie, sans l'augmenter.

L'utilité inclut :

- friction, rayon d'impact et irréversibilité;
- variation d'entropie;
- masse sous manque d'énergie et viscosité;
- latence sous température et viscosité;
- instabilité sous faible élasticité et forte gravité;
- nouvelle dette de preuve et résonance.

Les coûts physiques participent à chaque expansion d'une recherche bornée,
puis au classement des plans. Les préconditions, échecs connus et budgets
sont vérifiés sur l'état simulé de chaque étape.

| Régime | Condition prioritaire | Effet |
| --- | --- | --- |
| Revue humaine | Risque > 0,80 | Arrêt |
| Conservation | Énergie < 0,10 | Expansion interdite |
| Consolidation | Entropie > 0,70 | Arrêt avant expansion |
| Contention | Workers > 2 × workers requis | Expansion interdite |
| Normal | Sinon | Recherche normale avec coûts physiques |

L'inertie compare les scores physiques de la stratégie courante et de la nouvelle.
La pression et la plasticité facilitent le pivot; l'inertie et la résonance
augmentent son seuil. Un budget non fini bloque la décision.

## 4. Calibration et persistance

Chaque type de `Goal` possède un `MissionPhysicsProfile` versionné :
`secure-perimeter`, `recover-agent`, `repair-module`, `explore`, `conserve`.

Les observations accumulent moyenne et dispersion en ligne pour :

- ATP consommé et durée de mission;
- taille maximale du contexte observé pendant l'épisode;
- nombre d'arêtes d'un graphe complètement mesuré dans le périmètre déclaré;
- ATP et durée par concept effectivement exécuté.

Après trois observations, moyenne + écart-type ajuste les références de budget
(60–240 ATP), contexte (32 ko–2 Mo), dépendances (100–10 000 arêtes) et
durée (10–60 000 ms). Les coûts et latences par concept modulent aussi le score.
Le nombre de succès est conservé séparément : il ne fabrique pas une mesure de coût.

Une mission sans action consommée ne calibre rien. Un `tick()` isolé produit
un reçu de décision; l'apprentissage d'épisode intervient à la fin de `run()`.
Les seuils de revue humaine, conservation et consolidation restent fixes.

Les profils sont automatiquement sauvegardés dans
`.genos/physical-profiles/` via `SnapshotStore`, puis rechargés lors de la
première décision d'une nouvelle instance. Les snapshots sont append-only et
séparés par mission. Les versions et valeurs sont validées; un snapshot corrompu
est signalé et un ancien profil valide peut être repris.
Les anciennes sérialisations `DirectorState` restent lisibles et n'inventent
pas d'observations de calibration.

Un stockage inaccessible laisse la politique fonctionner avec les constantes
disponibles, tout en indiquant explicitement l'échec de persistance.

## 5. Observabilité

`eco.physics.last_report` et l'événement `PHYSICAL_DECISION` exposent les
mesures sourcées, l'état physique, le régime, la stratégie, la justification,
le nombre d'échantillons et les diagnostics.

`PHYSICAL_CALIBRATION` indique les coûts observés, la réussite finale,
le succès ou l'échec de la persistance. Ces événements ne constituent pas
des attestations de sécurité ou de qualité métier.

## 6. Matériaux et limites

`classify_material` reste une heuristique de nommage.
`classify_material_explicit` exige une déclaration cohérente pour les classes
Crystal et Membrane. `Material::required_evidence` expose un niveau demandé,
sans créer de preuve ou de revue à partir du nom du fichier.

Le runtime planifie des concepts; cette couche ne constitue pas à elle seule
une autorisation de modifier un fichier, une validation de migration ou un
rollback. Les gates de sandbox, de preuve et de promotion conservent leur rôle.

La calibration est descriptive et bornée. Elle mesure le runtime local; elle
n'établit pas une supériorité empirique des décisions ni une simulation physique.

## 7. Utilisation et diagnostic

L'exemple mesure le workspace donné en argument et lance une mission Rust locale :

```bash
cargo run -p genos-orchestrator --example mission_physics -- /chemin/du/workspace
```

Il affiche ticks, résultat observé, actions, régime, stratégie, états des mesures
et diagnostics de persistance. Il peut créer des snapshots locaux sous
`.genos/physical-profiles/`. Deux ticks ne garantissent ni une action exécutée
ni les trois épisodes nécessaires à l'ajustement des références.

| Observation | Vérification |
| --- | --- |
| Couverture `Missing` | Produire un rapport reconnu ou configurer `coverage_paths` |
| Couverture `Stale` | Régénérer le rapport après les sources couvertes et vérifier sa date |
| Inventaire ou imports `Partial` | Consulter le diagnostic et les limites de scan/résolution |
| Contexte sans tokens | Fournir un reçu modèle avec `set_context_usage` avant chaque décision |
| Calibration inchangée | Vérifier les actions consommées et le nombre d'échantillons de la mission |
| Profil non rechargé | Vérifier racine, droits, diagnostics, enveloppe et état des snapshots |

Le cache du workspace vaut 5 s. Après une mutation que la prochaine décision doit
observer immédiatement, appeler `invalidate_workspace()`.
Cette intégration Rust ne déduit pas les usages d'un modèle distant et ne
documente pas un raccord automatique au superviseur Node.js.

## 8. Architecture et validation

Les modules `physical_measurements`, `physical_workspace`,
`physical_dependencies`, `physical_imports`, `physical_coverage`,
`physical_git`, `physical_learning`, `physical_store`,
`physical_runtime`, `physical_policy` et `physical_search` séparent acquisition,
calibration, persistance et décision. `physical_telemetry` conserve les champs
optionnels historiques et applique les mesures à l'état.

```bash
cargo test -p genos-orchestrator --test physical_measurement_contract --test physical_calibration_contract --test physical_policy_contract
cargo test -p genos-orchestrator
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Les contrats de test couvrent les limites d'acquisition, imports et manifests,
rapports valides/invalides/périmés, déduplication, calibration réelle,
compatibilité, isolation des missions, rechargement, diagnostics et décision.
Les trois suites dédiées totalisent 23 tests ; leur réussite ne signifie pas
que les gates globaux du monorepo ou une mission métier sont validés.

## Voir aussi

- [runtime-agentique.md](runtime-agentique.md)
- [epistemologie-et-evidence.md](epistemologie-et-evidence.md)
- [../CONVENTIONS.md](../CONVENTIONS.md)
