# ADR 0002 — Boucle d'innovation AgentDNA (concept acquis → génome candidat → promotion)

- **Statut** : Proposé
- **Date** : 2026-09-14
- **Domaine** : Génome, apprentissage, orchestration, preuve
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [spec/AGENT_DNA_SPEC.md](../../spec/AGENT_DNA_SPEC.md), [docs/01-concepts/agent-dna-runtime.md](../01-concepts/agent-dna-runtime.md), [docs/01-concepts/epistemologie-et-evidence.md](../01-concepts/epistemologie-et-evidence.md), [docs/02-orchestration/reproduction-et-replication.md](../02-orchestration/reproduction-et-replication.md), [adr/0001-agent-dna-binary-format.md](0001-agent-dna-binary-format.md)

## Contexte

GenOS dispose déjà de toutes les primitives nécessaires : preuve de décision (`agentEvidenceService.hasDecisionEvidence`), génome héréditaire binaire `AgentDNA`, opérations `cross/mutate/clone/decoy/graft/speciate`, registre `agent_genomes` et sélection au spawn. Les primitives de plasmidie/spéciation existaient aussi (`evolutionSpeciation.js`, `genos evolution assimilate-plasmid`).

Mais **aucune boucle** ne reliait un succès nouveau d'un worker à la création d'un génome réutilisable : un agent pouvait résoudre un besoin avec un concept absent de son génome sans que l'orchestrateur n'en tire un trait héréditaire.

## Décision

Ajouter une **boucle d'innovation** en cinq étapes, avec un statut de candidat et un gate de promotion :

1. **Détection** : sur un worker **validé** (`hasDecisionEvidence`), comparer le `toolLease` observé (événement `WORKER_CAPABILITY_LEASED`) aux gènes du génome de base sélectionné ; tout outil absent est un concept nouveau (`TOOL_*`).
2. **Extraction** : produire une `GraftSpec { locus, instruction, plasmid }`.
3. **Synthèse** : `genos genome speciate` (côté Rust) dérive un génome enfant (`genome_id` neuf, `generation+1`, `parents=[base]`) et y distille les concepts.
4. **Enregistrement candidat** : stockage dans `agent_genomes` avec `status = 'candidate'` + ligne d'audit `agent_genome_innovations` (agent source, génome base, candidat, concept, évidence).
5. **Promotion** : passage à `status = 'active'` après gate (preuve falsifiable, coût réel, approbation/signature selon politique), ce qui rend le génome sélectionnable.

Règles structurantes :

- Un génome `candidate` est **exclu de la sélection automatique** (`selectGenome`/`bestMatch`), mais reste chargeable explicitement.
- La boucle est **opt-in** (`GENOS_AGENT_DNA=1`) et **best-effort** : elle ne doit jamais bloquer la réussite d'un worker.
- La provenance est obligatoire (`parents`, `selection = concept`, `agent_genome_innovations`).

## Alternatives considérées

| Option | Avantages | Inconvénients | Verdict |
| --- | --- | --- | --- |
| Greffe directe sur le génome de base | simple | pas de traçabilité de « nouvelle espèce » | Rejeté |
| `speciate` + statut candidat | nouvelle lignée, réutilisable après gate | plus de lignes DB | Retenu |
| Écrire un manifeste puis compiler | réutilise le compiler | format lourd, double chemin | Écarté |
| Plasmide global partagé | HGT simple | attribution floue du concept | Réservé (via `--plasmid`) |

## Conséquences

**Positives** : capitalisation des découvertes, cohérence bio-mimétique (néo-fonctionnalisation, radiation adaptative), base pour une sélection par domaine, aucune rupture des flux existants.

**Négatives** : nouvelles tables/colonnes (`status`, `concept`, `agent_genome_innovations`), heuristique de nouveauté encore déterministe (outils), dépendance au pont CLI.

**Risques et garde-fous** : collusion/coût nul → gate de preuve et de coût réel ; pullulement de candidats → statut gated + limite de sélection ; génome non fiable → traiter comme entrée non fiable + signature.

## Suivi

- Élargir la détection aux **stratégies** et aux **capacités** issues de l'artefact/preuve.
- Sélection par **domaine de mission** déjà amorcée (`scoreGenome` mission ×2).
- Gate de promotion formalisé (approbation humaine + signature obligatoire par tenant).

## Conformité

- `.genos.md` règle 5 (écart d'architecture sans ADR interdit) : satisfait.
- Documentation hors périmètre du gate `scripts/ci/check_code_quality.py`.

## Références de code

- `backend/src/services/agentDnaInnovation.js` (détection, capture, promotion)
- `backend/src/services/agentDnaStore.js`, `agentDnaOperations.js`, `agentDnaPolicy.js`
- `backend/src/services/workerEvidenceBarrierLocal.js` (hook preuve)
- `crates/genos-dna/src/operations.rs` (`speciate`, `graft`)
- `backend/src/db/schema-migrations.js` (`agent_genome_innovations`, `agent_genomes.status`)
