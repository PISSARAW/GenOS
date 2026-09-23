# Exécution cognitive via le client MCP

## Résumé

Lorsqu'une mission est lancée par `genos-mcp`, GenOS reste propriétaire de
l'orchestrateur et des workers. Le client MCP connecté fournit le LLM via MCP
Sampling. GenOS gouverne l'identité, le contrat, la stratégie, les budgets, les
capsules, les leases, les appels d'outils, la mémoire, les preuves et la
promotion.

```text
Client MCP (Codex, Gemini, Claude, ...)
              │ sampling
              ▼
      Orchestrateur GenOS
              │ workers contrôlés
              ▼
          Workers GenOS
              │ tools vérifiés
              ▼
          Backend GenOS
```

Le LLM externe n'est pas l'identité de l'agent. Il exécute une unité cognitive
au nom d'un agent GenOS.

## Utilisation

Un appel normal suffit :

```json
{
  "mission": "Écris une courte histoire...",
  "background": false
}
```

Le serveur MCP force alors `executor: caller_mcp`. Le provider peut être
indiqué pour la provenance avec `GENOS_MCP_PROVIDER` ou dans le champ
`provider`; il ne modifie pas les permissions.

Le client doit accepter les requêtes MCP `sampling/createMessage`. Si cette
capacité n'est pas disponible, GenOS bloque la mission avec
`MCP_SAMPLING_UNAVAILABLE`. Il n'y a pas de remplacement silencieux par Codex
ou Ollama.

## Boucle d'exécution

1. Le serveur MCP ouvre un broker local lié à `127.0.0.1`.
2. GenOS crée l'orchestrateur et son contrat.
3. Le runtime `caller_mcp` demande une génération au client hôte.
4. Si le LLM demande un outil, la demande revient au broker puis traverse le
   handler MCP. Le broker filtre le catalogue et refuse les outils hors de la
   lease déclarée par le runtime ; les handlers conservent leurs validations.
5. Le résultat de l'outil est renvoyé au LLM dans la même boucle, limitée à 12
   tours.
6. Les workers héritent de `caller_mcp`, mais gardent chacun leur identité,
   budget, capsule, rôle et lease.
7. La barrière de preuves et la supervision GenOS décident du statut final.

## Sécurité et limites

- Le broker utilise un jeton aléatoire et écoute uniquement en boucle locale.
- Un worker ne peut pas appeler `genos_orchestrate`.
- Le LLM ne reçoit pas le jeton du broker et ne peut pas modifier le contexte
  transmis par l'adaptateur. Cependant, ce jeton est partagé par les processus
  locaux : le broker ne constitue pas une isolation forte entre processus
  hostiles capables de lire l'environnement. Des capacités signées par agent
  restent nécessaires avant de revendiquer cette garantie.
- Les appels d'outils sont traités par le handler MCP GenOS, pas directement par
  le modèle.
- Une réponse du LLM ne constitue pas à elle seule une preuve valide.
- Le client doit autoriser Sampling ; MCP ne fournit pas cette capacité à tous
  les hôtes.
- Le provider appelant est tracé comme provenance, sans devenir une autorité
  GenOS.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `MCP_SAMPLING_UNAVAILABLE` | Le runtime GenOS n'a pas reçu de broker | Vérifier que la mission vient de `genos-mcp` |
| Sampling refusé | Le client ne supporte pas ou n'autorise pas Sampling | Activer la capacité côté client |
| `MCP tool bridge failed` | Outil refusé ou erreur de transport | Lire l'audit et la lease de l'agent |
| Boucle limitée à 12 tours | Le modèle répète des appels d'outils | Examiner la stratégie et les preuves |

## Compatibilité

Les exécutions backend directes conservent les modes historiques `codex`,
`local` et `solar-direct`. Le mode automatique décrit ici concerne le chemin
du serveur `genos-mcp`, qui force `caller_mcp` pour que le modèle appelant
soit le moteur cognitif de la mission.

## Registre de harnesses (HCL, ADR 0036)

Depuis l'[ADR 0036](../adr/0036-harness-compatibility-layer.md), les
exécuteurs historiques sont normalisés en drivers derrière un registre :
[backend/src/services/harnessRegistry.js](../../backend/src/services/harnessRegistry.js),
[backend/src/services/harnessCatalog.js](../../backend/src/services/harnessCatalog.js)
et
[backend/src/services/harnessDrivers/](../../backend/src/services/harnessDrivers/).

| Driver | Exécuteur | Capacités déclarées |
|---|---|---|
| `callerMcpDriver` | `caller_mcp` | `cognitive-generation`, `mcp-sampling`, `human-in-loop` |
| `codexDriver` | `codex` | `cognitive-generation`, `tool-execution`, `local-supervision` |
| `localDriver` | `local` | `cognitive-generation`, `tool-execution`, `offline-capable` |
| `solarDriver` | `solar-direct` | `cognitive-generation`, `tool-execution`, `direct-channel` |

`configuredExecutable`
([agentRuntimeExecutable.js](../../backend/src/services/agentRuntimeExecutable.js))
délègue d'abord au catalogue et conserve le dispatch historique en fallback :
le comportement des missions existantes est inchangé. GenOS reste l'autorité
sur l'identité, les contrats, les budgets, les leases, les snapshots et la
promotion ; un transport réussi n'est pas une preuve de décision valide.

La comparaison entre harnesses (migration progressive, fork + replay d'un
même snapshot, diff puis evidence) est outillée par
[harnessExperiment.js](../../backend/src/services/harnessExperiment.js) :
`planExperiment`, `diffResults`, `buildEvidence`, `runComparison`.

## Relais explicite pour un hôte sans Sampling natif

`node mcp/callerSession.mjs chemin/brief.json` ouvre un vrai client MCP stdio
annonçant `sampling.tools`. Le fichier d'entrée contient
`{"mission":"Écris une courte histoire…"}`. Le répertoire de ce fichier sert
de workspace source ; les capsules restent sous `.genos-agent-worlds` dans le
dépôt. Employer un workspace réduit pour une mission sans code évite de copier
tout le monorepo. Ce relais est un outil opérateur, pas un modèle autonome.

Pour chaque ligne `GENOS_SAMPLING_REQUEST`, l'hôte doit lire la mission et les
dossiers attachés, puis répondre sur stdin :

```json
{"id":"turn_1","result":{"role":"assistant","model":"nom-du-modele","content":{"type":"text","text":"{\"outcome\":\"success\",\"claims\":[{\"statement\":\"résultat\",\"evidence\":[\"artifactText\"]}],\"artifact\":\"creative\",\"artifactText\":\"histoire complète\",\"dossierInfluence\":[]}"}}}
```

Garder stdin ouvert (session interactive/PTY avec le terminal Codex). Les réponses
doivent être produites par le modèle hôte, jamais un accusé de réception forgé.
Le relais fixe une enveloppe de 30 000 tokens et un timeout de 20 minutes ; adapter
ces valeurs dans le relais pour un autre usage. Le timeout de la barrière doit
également permettre à l'opérateur de répondre aux workers. Une exécution en arrière-plan
ne survit pas à la fermeture du client Sampling.

Le runtime utilise le prompt commun GenOS : identité, contrat, capsule, lease,
politique, budget et dossiers de synthèse. Il exige un rapport JSON explicite et
passe par le validateur commun de preuves et d'influence. Un texte brut ne devient
plus automatiquement `outcome=success`. Le nom du provider est une provenance
déclarée, pas une preuve d'identité cryptographique du fournisseur.

## Vérification réellement obtenue le 18 septembre 2026

La mission `mcp_orchestrator_0c5ee796-cebc-4211-8b3d-1a3eb99df28b` a produit deux
récits puis une synthèse MCP. L'orchestrateur et ses deux workers sont
`completed` ; `DOSSIER_INFLUENCE_VERIFIED` et `EVIDENCE_REPORT` sont persistés.
Le récit retenu, « Le lit de l'autre », compte 308 mots, titre inclus.

Cette observation démontre la génération et la synthèse, **pas** la qualification
complète du runtime : l'audit retourne `required-coverage-incomplete`
(`genos_adversarial_review` et `genos_record_decision` non exécutés). La troisième
spécialité littéraire n'était pas financée par l'enveloppe choisie. Le second worker
a produit une alternative, sans recevoir le texte de l'auteur : aucune relecture
indépendante du récit retenu n'est revendiquée. Le résumé des tokens affiche zéro
malgré les estimations émises : ne pas l'utiliser pour une facturation.

Les corrections ciblent aussi le partage fractionnaire du budget monétaire,
l'initialisation de `worker_capacity`, la décision d'orchestration absente et le
lancement des scripts par `process.execPath`. Aucun contrôle de promotion n'est
supprimé pour obtenir le résultat.

Commandes ciblées : `npm --prefix mcp test`,
`node backend/tests/test_caller_mcp_reports.js`,
`node backend/tests/test_cognitive_executor.js`. `npm test` : 55 tests réussis.
Le contrôle global de qualité reste en échec sur des violations hors de ces
corrections ; `cargo test --workspace` est bloqué par des modules Rust
`executor_paths` et `executor_results` introuvables dans `genos-mcp`.
