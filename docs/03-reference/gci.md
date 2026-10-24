# GenOS Capability Inheritance (GCI)

**Statut : MVP Linked et adaptateurs Embedded/Managed implémentés — contrats, export explicite, résolution, persistance, API et CLI disponibles.** L'évolution produit des propositions sans effet automatique. La qualification de bout en bout sur un projet pilote externe reste à faire.

GCI sépare la découverte d'une capacité de son export, de son adoption et de son exécution. Le graphe de capacités reste la source de connaissance interne; seuls des descripteurs publiés dans `gci_capability_exports` sont découvrables par un consommateur.

## Contrats

- `spec/gci/capability.schema.json` décrit une capacité exportable et son empreinte d'implémentation.
- `spec/gci/project.schema.json` décrit les capacités, modes et permissions demandés par un projet.
- `spec/gci/lockfile.schema.json` épingle le graphe résolu, les digests et l'autorité effective.

Le résolveur accepte les dépendances transitives exactes. Il refuse les exports absents, les cycles, les capacités seulement déclarées, les modes non publiés et toute permission demandée qui n'est pas à la fois déclarée par la capacité et accordée au projet. L'autorité effective d'une dépendance transitive est contrôlée de la même manière.

## Persistance et exécution

La migration `154-gci-capability-inheritance` crée les tables d'exports, de liaisons, d'installations et de journal d'événements. Les écritures d'installation exigent une révision attendue et lient les reçus au projet et au digest du graphe.

L'adaptateur Linked relit l'installation et l'export actif à chaque appel, vérifie l'empreinte et recalcule l'autorité du projet via le callback d'intégration, puis inscrit un reçu d'invocation. Il ne fournit pas de handler par défaut : seuls les handlers explicitement injectés par l'intégrateur peuvent s'exécuter.

L'API REST est montée sous `/api/gci/v1` : découverte et inspection des exports, liaison d'un projet, résolution, adoption transactionnelle, état et révocation. Les routes passent par les middlewares d'authentification, de portée tenant, de permission et de limitation de débit existants. Chaque mutation vérifie le projet et les révisions attendues; les révocations de dépendances transitives bloquent les prochains appels Linked.

Le mode Embedded empaquette l'artefact et le descripteur, signe leur contrat avec Ed25519, puis vérifie signature et digest à l'installation. L'adaptateur remet les octets à un runtime sandbox injecté et conserve un reçu local; le consommateur n'a pas besoin d'un appel réseau à GenOS pendant l'exécution. Il doit fournir son vérificateur de provenance, son cache d'artefacts, sa sandbox, son état local de révocation et son stockage de reçus. Les révocations centrales ne prennent effet sur un consommateur hors ligne qu'après synchronisation.

Le mode Managed recalcule l'autorité et les révocations, puis crée une délégation idempotente dans le service Ontogenesis existant. Il exige une responsabilité SHÉV déléguée et une capsule isolée. Il retourne un reçu de délégation; l'exécution et sa vérification restent dans le cycle Ontogenesis.

## Export pilote : approbation d'exécution de stratégie

Le descripteur `spec/gci/exports/promotion-gate-v1.json` publie une tranche bornée
de `PROMOTION_GATE` : l'approbation d'un run de stratégie via
`POST /api/execution-runs/{runId}/approve`. Le contrat exige une clé authentifiée
avec `workspace:write`, les en-têtes de portée organisation/projet, un reçu
d'approbation lié au digest courant et une signature HMAC-SHA256 récente. Le
demandeur et le décideur doivent être distincts. Les refus d'authentification,
de permission et de portée sont couverts par `backend/tests/test_promotion_gate_http.js`.

La maturité `integrated` du descripteur s'applique uniquement à cette route et à
son contrat; elle ne généralise pas à toutes les voies de promotion/fusion, qui
restent `partiel` dans le registre produit. Une réponse `completed` signifie que
le run a terminé; elle ne constitue pas une vérification indépendante et
`epistemicState.promotable` reste faux. La découverte GCI expose le descripteur
en lecture seule; elle ne donne pas au client GenOSWork le droit d'approuver un
run. L'adaptateur Linked exige toujours un handler fourni par l'intégrateur.

`POST /projects/:projectId/upgrades/plan` et `genos-gci upgrade --dry-run` comparent le lockfile courant aux exports actifs, résolvent les nouvelles dépendances et enregistrent une proposition idempotente. Les révisions doivent correspondre à l'installation courante. Les candidats et les plans `no_change` apparaissent dans l'état du projet. Un plan indique toujours qu'une vérification indépendante reste requise; il ne modifie pas l'installation et ne crée pas de PR.

La CLI Node expose `discover`, `inspect` et `validate` localement, ainsi que `link`, `plan`, `adopt`, `status`, `revoke` et `upgrade --dry-run` via l'API. La commande `upgrade` exige `--manifest` et `--expected-revision`. Les commandes distantes exigent `GENOS_API_URL`, `GENOS_API_TOKEN`, `--organization` et `--project`. Elles utilisent les mêmes routes et contrôles d'autorité que les appels REST. La propagation automatique, la création de PR, les décisions accept/reject, l'exposition MCP et la vue Studio ne sont pas livrées.
