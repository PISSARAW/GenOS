# Qualification des consommateurs P0 — 2026-10-07

## Périmètre et résultat

Cette reprise inspecte les consommateurs existants des lots L01 à L05 et L22.
Le mapping externe a été retrouvé dans la Page « Plan de réalisation et de
validation de GenOS » : 115 références sur les 649 du plan. Il est conservé
dans la [matrice nominative](matrice-consommateurs-l01-l05-l22-2026-10-07.md).
La mention historique « mapping externe à fournir » dans l’audit P0 est donc
levée. Les sorties complètes de ces lots restent partiellement ouvertes.

Le harnais `npm --prefix backend run test:p0-consumers` exécute 57 commandes
séquentielles, conserve leurs sorties et vérifie les empreintes des sources
backend, des protos, du catalogue partagé et du serveur MCP, hors dépendances
et artefacts de mondes GenOS générés. Chaque commande
reçoit une base et un Studio temporaires ; certains tests historiques ouvrent
leur propre base de fixture. Aucun résultat de fixture n’est un gain IA mesuré.

## Corrections issues des parcours

- Le stockage d’une expérience ordinaire n’ajoute plus un marqueur de fait
  système vérifié. Le scoring et le prompt neutralisent ce marqueur dans une
  source qui n’a pas les drapeaux internes attendus.
- La mémoire de promotion utilise l’ID stable de l’agent et le tenant de son
  workspace, relus en base. Elle relit l’assemblage AEIS précis utilisé pour
  ce run, contrôle son sceau, son acceptation et son scope, puis enregistre
  une provenance parent/enfant. Voir [ADR 0345](../adr/0345-provenance-memoire-des-promotions.md).
- `GetWorkflowStatus` lit le run SQLite dans le scope demandé et sérialise
  son état réel. Les champs additionnels `success` et `error_code` figurent
  dans le proto et sa source de génération. Une erreur MCP structurée devient
  une erreur gRPC au lieu d’un succès.
- Cinq anciennes attentes de test sont corrigées : lease vide, promotion sur
  déclarations de preuve, signature humaine seule, revue éthique seule et
  transmission d’une variable d’environnement hors allow-list.
- L’arrêt d’urgence appelait une fonction absente. La boucle manquante
  utilise désormais `killVerifiedAgent`, qui relit l’identité du PID avant
  de demander sa terminaison. Le test utilise sa propre base de fixture.
- Le service de conformité accepte le scope administrateur local null sans
  erreur et confine ses listes et lectures aux lignes locales. Un test SQLite
  contrôle aussi les refus entre deux projets ; le parcours HTTP/export passe.

## Mémoire : preuve exécutée et frontière

`test_consumer_memory_provenance` écrit réellement en SQLite une expérience
et une source forgeant le marqueur ainsi que les options `verified` et
`systemSigned`. Un nouveau processus ouvre la même base, recherche les
souvenirs et construit le prompt. Le lien de provenance subsiste ; aucun
marqueur de fait système vérifié ni drapeau du demandeur n’est reconstitué.

`test_consumer_promotion_limits` exécute aussi une promotion avec deux
répliques locales de `npm test`. Il vérifie la mémoire sous l’ID de l’agent,
les scopes organisation/projet, le parent décrivant run/contrat/assemblage et
les IDs des résultats. Le sceau de l’assemblage est relu ; un autre tenant ne
récupère pas le souvenir ; une réouverture dans un processus enfant conserve
son lien de provenance.

La provenance mémoire emploie des hashes de contenu. Le sceau de l’assemblage
est un HMAC. Les drapeaux internes acceptés par le scoring ne sont pas une
chaîne cryptographique universelle d’authentification des sources. Le filtrage
d’un marqueur ne garantit pas l’absence d’injection de prompt. La mémoire
reste au mieux après finalisation : son échec est télémétré et ne remet pas
atomiquement la promotion à son état précédent.

## Promotion : reprise et concurrence

| Sonde | Effet observé | Garantie et limite |
|---|---|---|
| Même lot, deux connexions SQLite | Une réservation gagne ; la seconde est refusée | Anti-rejeu transactionnel du lot |
| Échec au cours de la réservation | Aucune réservation partielle conservée | Atomicité des nonces du lot |
| Échec injecté après le vrai pipeline | Les deux nonces restent consommés ; run encore en attente | Des effets peuvent avoir eu lieu avant l’échec |
| Réouverture dans un nouveau processus | Même lot signé refusé ; run en attente conservé | Pas de réutilisation automatique de ce lot |
| Deux lots frais distincts, même run en attente | Les deux réservations réussissent sur deux connexions | Aucun verrou d’exécution par run fourni par ce consommateur |
| Assemblage persisté altéré | Relecture refusée par contrôle d’intégrité | Contenu scellé contrôlé |

La sonde d’échec aval délègue au vrai pipeline avant d’injecter le défaut.
Elle ne tue pas arbitrairement le processus et ne qualifie pas tous les points
de crash possibles. La concurrence de lots frais vise le consommateur de
nonces, pas un test de bout en bout de deux pipelines simultanés.

L’[ADR 0343](../adr/0343-consommation-des-recus-avant-promotion.md) reste
opposable : anti-rejeu ne signifie pas exécution exactement une fois.
Relancer avec un nouveau lot exige une évaluation des effets partiels.
Une réservation atomique du run, un journal d’effets et une stratégie de
reprise/idempotence restent nécessaires avant une garantie plus forte.

## Ce qui est réellement qualifié par lot

| Lot | Parcours exercés | Limites maintenues |
|---|---|---|
| L01 | Contrats REST/SQLite, ledger, liaison de décisions, stockage/rappel/prompt mémoire, assemblages | Le ledger et plusieurs tests utilisent des fixtures ; manifeste scientifique complet non qualifié |
| L02 | Cedar, délégation Biscuit, leases, tenant, chemins, coffre, gates humains et éthiques, rapports de conformité | SAML négatif et métadonnées seulement ; cycle IdP positif, CORS complet et certification non qualifiés |
| L03 | Promotion avec deux répliques exécutables, lignée de vérificateurs, processus HTTP locaux, refus d’altération | Fournisseurs de fixture ; un echo formel n’est pas une preuve Lean/SMT ; trois domaines scientifiques non achevés |
| L04 | AgentGit SQL, capsules, hashes, manifestes filtrés, bisection de fixture, forks procéduraux, modèles Self-Twin | Runner causal injecté ; ni annulation externe ni causalité empirique universelle |
| L05 | Protocoles GVX, cycle de politique avec processus isolés, budgets, résultats et statistiques de fixture | Holdout IA et puissance représentative non qualifiés ; aucun gain expérimental annoncé |
| L22 | REST, gRPC réel, MCP HTTP/stdio, opérateur, MsgPack, audit, sessions, traces, health/readiness | Parité MCP minimale ; IDE contractuel ; Studio/TUI interactifs non exercés |

Le test gRPC ajouté utilise un vrai client, les protos et une base SQLite :
`failed` demeure un échec, `running` n’est pas un succès, `completed` est
restitué, un autre scope et l’absence de clé sont refusés. La clé gRPC demeure
une clé partagée de plateforme ; ces tests ne la transforment pas en RBAC
individuel tenant. Les 41 services sondés ne garantissent pas la sémantique de
toutes leurs méthodes. `StartWorkflow` et la parité globale restent hors de
cette correction ciblée.

La façade réelle `g.ps1 --help` atteint `genos-simple-cli` ; son aide et les
tests Rust passent. Cette sonde ne réalise pas de mission complète et ne
qualifie pas le lien CLI/backend/Studio sur un même run.

## Reproduction et conservation des preuves

```powershell
npm --prefix backend run test:p0-consumers -- C:/chemin/vers/preuves
python scripts/ci/check_code_quality.py
npm test
$env:CARGO_TARGET_DIR = 'D:/GenOS-build/cargo-target-20261007'
cargo test --workspace
.\g.ps1 --help
```

Sur cet hôte Windows, les commandes natives ont été exécutées avec les
permissions nécessaires aux processus, sockets localhost et au cache D:.
Le profil Cargo du dépôt évite les PDB et l’incrémental ; aucune baseline
qualité n’est relâchée.

Les preuves brutes sont locales, hors dépôt :
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p0-consumers/`.
`plan-source.json`, `selected-plan-references.json` et
`concept-consumer-matrix.json` conservent le périmètre source.
`suite-stable/consumer-results.json` conserve codes, durées, hashes et
journaux par commande. Les premières passes sont conservées : 40/46, puis
46/46 avec une modification de source pendant l’exécution, puis 56/57 sur
sources stables (défaut scope null en conformité). Une passe suivante a
capturé un changement concurrent du middleware CSRF et ses échecs ; elle est
aussi conservée. La passe `suite-stable` réussit 57/57 mais observe un changement
concurrent de `tenant.js`. Les sept parcours concernés sont donc rejoués via
`tenant-recheck/runner.cjs`, qui emploie le même harnais et conserve un second
manifeste d’empreintes. Cette reprise obtient 6/7 sans dérive : publication du
snapshot de baseline refusée par Windows (`EPERM` sur rename), sans erreur du
middleware. La passe suivante est conservée sous `tenant-recheck-final/`.
Cette observation reste une limite de fiabilité du parcours snapshot ; son
origine n’est pas attribuée à un antivirus ou à un autre processus sans preuve.
Aucun résultat de passe avec dérive n’est présenté comme une validation
intégralement stable.

## Validation finale

| Vérification | Résultat | Preuve locale |
|---|---|---|
| Harnais L01–L05/L22 | 57/57, exit 0 ; une dérive concurrente de tenant.js détectée | suite-stable/consumer-results.json |
| Parcours affectés rejoués | 7/7, exit 0 ; zéro dérive de source | tenant-recheck-final/consumer-results.json |
| Gate qualité | 5 327 sources, 109 violations admises, zéro nouvelle ; exit 0 | code-quality-source.log |
| npm test | Exit 0 après correction de la fonction d’arrêt d’urgence | npm-test-after.log |
| cargo test --workspace | 671 tests, 80 suites, zéro échec et zéro ignoré ; exit 0 | cargo-workspace.log |
| Façade g.ps1 --help | Exit 0, CLI natif atteint | operator-g-help.log |
| CSRF complémentaire | Exit 0 | csrf-after.log |
| Index ADR | 421 fichiers, 421 lignes, zéro problème | scripts/ci/check_adr_index.py |
| Whitespace Git | git diff --check : exit 0 | Vérification finale du checkout |

`validation-summary.json` conserve les empreintes des journaux et les limites.
La dernière comparaison des sources applicatives avec leur manifeste n’observe
aucune divergence ; les mondes GenOS générés sont exclus de cette comparaison.

La baseline qualité reste identique : SHA-256
`B971F4E32783538077B37AFA0D5D0C83DFCFC88956BC684AFB8838D93184C944`.
Les résultats et limites sont persistés dans GenOS ; cette persistance ne
certifie pas leur vérité. La qualification scientifique des nouvelles
fonctionnalités du plan reste explicitement non démontrée. B06 reste partiel
pour les garanties plus fortes citées dans la matrice et la fiabilité Windows
de publication des snapshots.

## Reprise B06 ultérieure

La [qualification B06](qualification-b06-reprise-et-holdout-2026-10-07.md)
remplace les limites de concurrence et de reprise des promotions ci-dessus
par les garanties bornées du journal scellé. Elle conserve les échecs précédents,
qualifie les retries de publication Windows, un pilote IA réel et une session
TUI live. Studio et l'extension IDE installée restent à exercer ; la maturité
scientifique de tous les concepts n'est pas déduite de ce pilote.
