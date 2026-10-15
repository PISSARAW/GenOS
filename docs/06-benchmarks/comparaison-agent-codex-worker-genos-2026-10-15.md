# Comparaison locale entre un agent Codex et un worker GenOS

- **Date d'exécution** : 2026-10-15
- **Dernière revue** : 2026-10-15
- **Statut** : expérience locale exécutée ; résultat de sécurité concluant ; comparaison de performance partielle
- **Portée** : une mission, une exécution Codex pure et plusieurs tentatives GenOS jusqu'au run final qualifié

## Objet

L'expérience compare deux agents auxquels la même question a été soumise :

> Can a client call an MCP tool excluded by `GENOS_MCP_DISABLED_TOOLS`?

Le premier agent devait se comporter comme un agent Codex autonome, sans appeler les
outils ni les workflows GenOS. Le second était un `verifier_worker` exécuté par GenOS
dans un espace isolé, avec une lease MCP, un budget et un contrat d'évidence.

La conclusion technique globale est positive : **un outil retiré par
`GENOS_MCP_DISABLED_TOOLS` ne peut pas être appelé par un client**. La deny-list retire
l'outil de la découverte et le contrôle d'appel direct le refuse également.

Cette conclusion globale doit être distinguée du verdict `unresolved` produit par le
worker GenOS. Ce dernier n'avait pas exécuté lui-même une sonde `tools/call` de bout en
bout ; son contrat lui imposait donc de ne pas transformer ses preuves partielles en
verdict définitif.

## Protocole

### Conditions communes

| Élément | Valeur |
| --- | --- |
| Mission | chaîne anglaise reproduite ci-dessus, identique pour les deux agents |
| Dépôt | workspace GenOS local sous Windows |
| Cible | serveur MCP Node et règles de lease du dépôt |
| Modification de fichiers | interdite aux deux agents pour la mission d'audit |
| Date | 15 octobre 2026, fuseau Europe/Paris |

### Agent Codex pur

L'agent Codex a reçu l'interdiction explicite d'utiliser GenOS. Il a inspecté les
sources, exécuté `node mcp/test_lease.js`, puis construit une sonde JSON-RPC en mémoire.
La sonde a vérifié les deux états suivants :

1. `genos_snapshot` est exposé lorsque la lease l'autorise et qu'il n'est pas désactivé ;
2. le même outil disparaît de `tools/list` et son appel direct est refusé lorsqu'il est
   ajouté à `GENOS_MCP_DISABLED_TOOLS`.

Le verdict rendu est **non** : le client ne peut pas appeler l'outil désactivé.

### Worker GenOS

Le worker final avait les propriétés suivantes :

- type : `verifier_worker` ;
- rôle : `verifier` ;
- workspace isolé ;
- aucun droit d'écriture ;
- huit outils dans la lease du runtime GenOS ;
- posture `REQUIRE_EVIDENCE` ;
- artefact obligatoire : `verification_report` ;
- budget effectif persisté : 20 000 jetons facturables, 540 000 ms et 200 événements.

L'opérateur avait demandé un plafond supérieur lors du dernier lancement, mais le
contrat de stratégie parent a conservé le plafond effectif de 20 000 jetons. Le worker
a été autorisé à exécuter uniquement :

```text
node mcp/test_lease.js
rg -n GENOS_MCP_DISABLED_TOOLS mcp docs shared backend/tests
rg -n MCP_TOOL_LEASE_DENIED mcp backend
```

Cette liste n'incluait ni une sonde JSON-RPC personnalisée, ni
`backend/tests/test_mcp_direct_call_enforcement.js`.

## Résultats

| Mesure | Agent Codex pur | Worker GenOS final |
| --- | ---: | ---: |
| Verdict de l'agent | `no` | `unresolved` |
| Conclusion soutenue par les preuves | appel refusé | deny-list prioritaire, appel direct non reproduit par ce worker |
| Temps observé | environ 46 s | 77 570 ms |
| Temps de la sonde Codex | 6,56 s | sans objet |
| Jetons d'entrée | non exposés | 41 835 |
| Jetons d'entrée mis en cache | non exposés | 31 616 |
| Jetons de sortie | non exposés | 773 |
| Contexte total | non exposé | 42 608 |
| Jetons facturables | non exposés | 10 992 |
| Événements comptabilisés | non exposés | 21 |
| Coût fournisseur enregistré | non exposé | 0 USD télémétré |
| État de l'agent | terminé | terminé |
| État du run de stratégie | sans objet | bloqué par la gate de promotion |

Le coût GenOS égal à zéro est une valeur de télémétrie, pas une preuve de gratuité. Le
runtime ne disposait pas d'un tarif fournisseur permettant de convertir l'usage en coût
réel.

Les jetons facturables du run GenOS sont calculés comme suit :

```text
(41 835 entrées - 31 616 entrées en cache) + 773 sorties = 10 992
```

Le total de contexte, `41 835 + 773 = 42 608`, reste utile pour mesurer la taille de
l'exécution, mais il ne doit pas être comparé directement au budget facturable.

## Preuves du run GenOS final

| Élément | Identifiant |
| --- | --- |
| Run | `strategy_run_1792057095291_8091fef0` |
| Worker | `worker_mcp_orchestrator_f48efe51-e3c5-42ff-b730-def1fdb0ecf9_67cfbed7-2e6e-445e-a565-ae7c8602857f` |
| Mission | `mission_4edb34cf-a20a-414e-b039-65c716b74d6b` |
| Reçu biologique | `b06672a5-c031-5c52-8993-4c5d9300f4d3` |
| Capsule | `e93f1be0-7154-43c0-ae8c-dbc64191c969` |

Le reçu `genos.worker-biological-execution-receipt/v1` indique :

- `accounting.consistent = true` ;
- 21 événements observés et 21 événements enregistrés ;
- correspondance des jetons et du coût ;
- budget satisfait ;
- événement terminal `AGENT_COMPLETED` ;
- rapport `verification_report` présent ;
- promotion refusée par `require_independent_verification`.

Le rapport du worker cite `mcp/test_lease.js:19`,
`docs/03-reference/outils-mcp.md:161`,
`docs/03-reference/outils-mcp.md:178` et `mcp/index.js:316`. Il conclut que les preuves
contredisent la possibilité d'exécution, tout en conservant `unresolved` parce qu'aucun
appel direct de bout en bout n'a été exécuté par ce worker.

## Pourquoi `unresolved` reste correct

Le verdict porte sur la preuve collectée par le worker, pas sur toutes les preuves de
l'expérience. Ses observations montrent que :

- la deny-list gagne sur la lease ;
- le test unitaire de lease réussit ;
- le serveur possède une réponse `MCP_TOOL_LEASE_DENIED`.

Elles ne démontrent pas, à elles seules, qu'une requête JSON-RPC réelle envoyée par un
client connu est refusée sur le chemin complet `tools/call`. Le worker a donc respecté
son contrat en laissant ce point non résolu. L'agent Codex a réalisé la sonde manquante,
ce qui permet à l'expérience combinée de conclure au refus.

La gate de promotion est une décision séparée. Le worker peut terminer et produire un
artefact valide alors que le run reste `blocked`, car le contrat exige une vérification
indépendante avant promotion. Ce blocage est un comportement fail-closed attendu.

## Comparaison de la démarche observable

Les chaînes de pensée privées ne sont ni exposées ni comparées. Seules les actions et
preuves observables sont considérées.

### Codex

- inspection ciblée des règles de lease ;
- test unitaire ;
- construction d'une sonde JSON-RPC de falsification ;
- verdict direct fondé sur le chemin complet.

### GenOS

- récupération de mémoire et de précédents d'échec ;
- préflight de l'inventaire MCP ;
- exécution dans une capsule isolée ;
- commandes bornées par le contrat ;
- rapport typé et provenance ;
- reçu immuable et comptabilité ;
- refus de promotion sans preuve indépendante.

Sur cette mission courte, Codex a fourni une réponse plus décisive et a été environ
1,7 fois plus rapide selon les temps disponibles. GenOS a fourni davantage de
traçabilité, d'isolation et de contrôles, au prix d'un surcoût d'exécution et d'une
conclusion plus prudente.

## Réparations nécessaires avant le run final

Les premières tentatives GenOS ont révélé puis permis de corriger :

- la portée de la mémoire de requête par workspace ;
- la propagation de `capsuleRoot` et du workspace déjà provisionné ;
- la création de l'identité et du bail de mission avant l'enveloppe d'autorité ;
- la résolution du SDK MCP depuis la capsule avec fallback vers l'hôte ;
- la présence des commandes autorisées dans le prompt du worker ;
- les appels de persistance de la conscience ;
- le calcul du budget à partir des jetons facturables ;
- la déduplication du résumé terminal ;
- la comptabilité du reçu biologique en présence de jetons mis en cache.

Les tests ciblés associés ont réussi, ainsi que `cargo test --workspace`, les huit suites
Garage, P1 V3 et la suite scientifique.

## Reproduction du contrôle de sécurité

Les deux contrôles versionnés suivants couvrent la règle de lease et le contrôle direct
du backend :

```powershell
node mcp/test_lease.js
node backend/tests/test_mcp_direct_call_enforcement.js
```

Résultats attendus :

```text
MCP lease checks passed.
Direct MCP calls honor lease and disabled-tool policy.
```

Pour qu'un futur worker GenOS rende directement `reject`, son contrat doit également
autoriser le second test ou une sonde JSON-RPC équivalente, puis faire vérifier le reçu
par une identité indépendante avant la promotion.

## Limites

- Un seul cas et une seule exécution finale par mode ne constituent pas un benchmark
  statistique.
- Les métriques de jetons Codex n'étaient pas exposées ; aucune comparaison d'efficience
  en jetons n'est possible.
- Les temps ne proviennent pas du même instrument : le temps Codex est un chronométrage
  externe approximatif, celui de GenOS est persisté par le runtime.
- Les capacités d'exécution différaient : Codex pouvait construire une sonde ad hoc,
  tandis que GenOS était limité à trois commandes prédéfinies.
- Le HEAD du dépôt a évolué pendant la longue séquence de réparation et de validation ;
  l'expérience ne scelle donc pas une comparaison à révision Git unique.
- Le run GenOS n'a pas reçu de vérification indépendante signée ; sa promotion reste
  correctement bloquée.
- `npm test` n'a pas produit de verdict global vert sur l'état concurrent final : un test
  Trinity observait `partial` au lieu de `complete`. Au moment de cette revue, le gate de
  qualité signalait huit nouvelles violations dans des sources extérieures à cette
  modification documentaire.

Ces limites interdisent d'inférer une supériorité générale de Codex ou de GenOS. Le
résultat démontre uniquement la propriété de sécurité testée et illustre la différence
entre une réponse techniquement juste et une promotion formellement autorisée.
