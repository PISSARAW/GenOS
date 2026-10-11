# Qualification P1 — mémoire négative et consommateurs stdio

- Date : 2026-10-10
- Portée : extension partielle de L02/C591 et L22/C565 ; P1 reste ouvert.
- Révision de départ : `85d68d9135233eb875edbee41cfc6552e080a037`.
- Checkout partagé : `9a49ec9ec540cc3c9f9492283f39b44b4b9977d8` pendant les
  vérifications, avec modifications concurrentes hors de ce changement.
- Un commit documentaire concurrent `b3e4fbcee6db5377451de668e4f9d3d1cb99db97`
  intervient ensuite ; son ajout dans l’index partagé est conservé.
- Décision : [ADR 0388](../adr/0388-portee-memoire-negative-et-parite-stdio-reelle.md).

## Défauts observés et corrections

| Contre-épreuve | Observation avant correction | Comportement vérifié |
| --- | --- | --- |
| SQLite avec projets frères et tenants distincts | Projet ignoré ; globales et trajectoires voisines incluses | Organisation/projet filtrés ; globales explicites, ambiguës et orphelines exclues |
| Même limite 100 sur Node et Rust | Acceptée par Node, refusée par le backend Rust | Maximum canonique 50 appliqué aux deux chemins |
| Lecture stdio Rust valide | Tableau de contenu MCP imbriqué, sans résultat métier direct | Résultat métier identique à Node |
| Scope incomplet avec requête non vide | Deux requêtes HTTP d’embedding avant refus | Zéro requête avant refus des deux primitives |
| Contre-épreuve indépendante sur l’API interne | Tableaux et primitives considérés comme contexte non scopé | Conteneurs mal formés refusés avant lecture |
| Contre-épreuve stdio indépendante avec `arguments: null` | Rust transforme `null` en objet vide et retourne des mémoires sans scope | `null` explicite refusé ; seule l’absence d’arguments conserve le défaut historique |

La lecture historique sans scope reste disponible. Un scope déclaré n’est
pas un principal authentifié ni une preuve de droit de lecture. Cette
qualification ne ferme donc pas l’authentification multi-tenant de L02.

## Protocole et preuves

`test_failure_memory_scope.js` utilise SQLite réel : décisions, trajectoires,
projets frères, tenants étrangers, globales propres ou ambiguës, workspace
orphelin, scope incomplet et injection SQL. `test_failure_memory_effect_order.js`
compte les requêtes reçues par un serveur HTTP local avant refus.

`GENOS_P1_RUST_MCP` doit désigner le binaire construit, puis
`npm run qualify:p1-stdio` lance quatorze processus réels, sept par implémentation,
sur une base temporaire commune. Les cinquante-quatre requêtes JSON-RPC comprennent
vingt-huit `tools/call`. Le protocole vérifie résultat métier, stdout JSON-RPC,
globales explicites, projet absent, limite invalide, outil hors lease, retrait
et restauration d’une mémoire, `null` explicite, absence/désactivation/expiration de lease.
Une expiration survient pendant la session, après une première liste positive.
Les canaris ne doivent pas apparaître dans les refus.

Le binaire MCP final, reconstruit après le refus de `null`, a le SHA-256
`3c4ef83c39133ae0d8629700e25f4482a23c3dda931d36d383ceb955e4680d78`.
Les premiers essais utilisent le binaire
`a6d0441529c72c74f181e459ac8845463d7f66fbc8282b86fe2ada396c190950` ;
leurs résultats ne sont pas attribués au binaire final.
Les processus utilisent des racines temporaires, sans chargement de `.env`
ni héritage des credentials des fournisseurs ; aucun appel modèle n’est requis.

Les preuves sont conservées hors Git dans
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p1-l22-scope-20261010`.
Les journaux initiaux restent disponibles : `scope-before.log`,
`stdio-initial.log`, `stdio-route-before.log`, `effect-order-before.log`.
`stdio-qualified.log` conserve le blocage au sixième appel par le circuit.
La suite finale utilise une nouvelle session pour les trois lectures de cycle
de vie ; aucun circuit n’est désactivé.

## Reprise après crash et vérification globale

La première exécution de `npm test` échoue sur `SQLITE_BUSY` dans le processus
frais du test de crash natif. Ce parcours utilisait `spawnSync`, qui empêche
la boucle Node parente de terminer ses transactions pendant l’attente.
Le test utilise maintenant un processus asynchrone et une transaction
parente volontairement retenue 100 ms : le rejeu doit attendre sa libération,
refuser la réservation déjà utilisée et préserver les coûts inconnus.
Les contrôles de réservation et de preuve du runtime restent appliqués.
La contre-épreuve `crash-blocking-counterproof.cjs` substitue l’ancien appel
synchrone uniquement dans un processus de test : avec la même contention,
il reproduit `SQLITE_BUSY`. `crash-contention-final.log` conserve le succès
du parcours asynchrone. Cette correction concerne la sonde de test.

| Vérification | Résultat et journal |
| --- | --- |
| `npm test` | Réussi ; `npm-final.log`, après correction de la sonde de crash |
| `cargo test --workspace` | Réussi ; `cargo-final.log`, dont le test Rust de refus de `null` |
| `npm --prefix backend run test:mcp` | Réussi ; `mcp-complete.log` |
| `node backend/tests/run_p1_v3_suite.cjs` | Réussi ; `p1-v3-final.log`, dont scopes mal formés et refus avant HTTP |
| `npm run qualify:p1-stdio` | Réussi avec le nouveau binaire ; `stdio-qualified-final.log` et ses reçus, 14 processus et 28 appels métier |
| Qualité des sources du changement | 12 fichiers stricts, zéro violation ; `staged-strict.log` |
| Qualité du contenu de commit | Zéro nouvelle violation, quatre dettes historiques ; `quality-commit.log` |
| Index des ADR | Réussi ; `adr-index.log` |

Ces vérifications concernent le checkout partagé observé, incluant les
modifications concurrentes. Elles ne constituent pas un rejeu intégral
du seul commit qui sera créé. Les qualifications indépendantes distinguent
leurs versions gelées et les corrections ajoutées ensuite.

Le contrôle indépendant ne reçoit ni verdict ni journaux primaires. Son
rapport provisoire `independent/provisional-independent-report.json`
conserve les quatre fuites par conteneur invalide, puis dix-neuf contre-épreuves
réussies après correction, et dix refus avant effets HTTP avec contrôle
positif. Il découvre aussi le défaut Rust/`null` sur l’ancien binaire. Les
octets de cet ancien binaire n’ont pas été archivés avant reconstruction ;
son hash observé et ses transcripts sont conservés, sans capsule binaire
historique présentée comme disponible. La qualification finale du nouveau
binaire complète séparément cette preuve.

Le rapport final `independent/final-independent-report.json`, SHA-256
`ebcff86e9d1b51dc700f9108e26ed9198dffb999be483c152e686eb84863b6d5`,
confirme le parcours canonique sur quatorze clients frais, dix-neuf
contre-épreuves internes de scope, trente contre-épreuves stdio sur dix
clients supplémentaires et vingt refus avant effets. Le contrôle HTTP
positif produit une requête et ouvre la base. Aucun stdout invalide n’est
observé. Le nouveau binaire est archivé ; le manifeste de runtime gelé a
le SHA-256 `938e906ef060586c4d952098907233cdc6d38d5c927f110025e921bc6d6ac3ca`.
L’ultime adaptation du harness est archivée séparément. Les sources, les
dépendances, Node et le binaire restent stables pendant la qualification.

La recherche de mémoires d’échecs a été effectuée via GenOS MCP. Aucun
checkpoint GenOS nouveau n’est annoncé : la session courante ne fournit pas
les métadonnées de checkpoint du hook. La décision et les preuves restent
consignées localement dans cet audit et l’ADR.

## Limites restantes

Le test porte sur la mémoire négative et les leases de ce chemin de
développement. Il ne qualifie pas tous les outils MCP, l’accumulation du
circuit entre appels Node/Rust, les autres consommateurs REST/gRPC/CLI/g/
IDE/Studio/TUI, ni la qualité décisionnelle d’une campagne IA représentative.
Le scope de signaux et de preuves, l’isolation OS et l’équité entre tenants
restent ouverts. Les tests logiciels ne prouvent aucun gain général d’IA.
Node refuse `null` par une erreur JSON-RPC du SDK, Rust par un résultat
`isError: true` : le refus sans lecture est commun, leur enveloppe diffère.
