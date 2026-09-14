# ADR 0005 — Réorganisation de l'arborescence documentaire

- **Statut** : Accepté
- **Date** : 2026-09-14
- **Domaine** : Documentation, provenance, distribution
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0001](0001-agent-dna-binary-format.md) (provenance AgentDNA), [../README.md](../README.md), [../CONVENTIONS.md](../CONVENTIONS.md), [spec/AGENT_DNA_SPEC.md](../../spec/AGENT_DNA_SPEC.md)

## Contexte

La documentation vivait à plat : 58 fichiers `docs/*.md` plus 4 ADR. Les conséquences
observées :

- 16 documents n'étaient référencés nulle part dans l'index (familles topologies,
  biomimétisme, benchmarks, qualité, multi-tenant).
- Aucune hiérarchie : les 8 modes d'orchestration étaient noyés dans le reste.
- Nommage incohérent (`gestion-projet-multi-tenant.md` vs `UPPER_SNAKE`).
- Liens internes cassés ou machine-spécifiques.

Contrainte structurante : les chemins `docs/*.md` sont des **identifiants de provenance
scellés**. Ils sont encodés dans `source_doc` de 227 manifestes `agents/*.agent.json` et
dans 226 binaires `agents/dna/*.dna`, persistés en SQLite (`agent_genomes.source_doc`) et
lus au runtime (`crates/genos-cli/src/commands/world_runner.rs`). Toute réorganisation
impose donc une **migration de provenance**, pas un simple rangement.

## Décision

Réorganiser `docs/` en familles numérotées et adopter le `kebab-case` pour les noms de
fichiers :

```text
docs/
├── README.md              # hub
├── CONVENTIONS.md
├── 01-concepts/           # fondations, biomimétisme, nosologie
├── 02-orchestration/      # exécution + topologies/
├── 03-reference/          # API, MCP, données, providers, IDE
├── 04-exploitation/       # déploiement, CLI, observabilité, reprise
├── 05-securite-gouvernance/
├── 06-qualite-preuves/    # + benchmarks/
├── 07-positionnement/
├── adr/
└── archive/
```

La migration exécutée comprend :

1. **Déplacement** de 61 chemins (`git mv`), préservant l'historique.
2. **Réécriture des liens** relatifs par résolution puis re-relativisation depuis la
   nouvelle profondeur (1 629 liens).
3. **Mise à jour de la provenance** : `source_doc` des 227 manifestes pointe vers les
   nouveaux chemins.
4. **Recompilation des génomes** : les 227 `.dna` ont été recompilés via
   `genos genome compile`. Les fichiers n'étant **pas signés** (aucune clé Ed25519 dans
   le dépôt), la recompilation est sûre. Elle corrige aussi `source_manifest`, qui
   était stocké en chemin absolu Windows.
5. **Alignement** de `llms.txt`, du runtime Rust, des README et de `AGENTS.md`.

## Conséquences

### Positives

- Navigation par familles et index locaux (`README.md` par dossier).
- Plus aucun document orphelin.
- `kebab-case` homogène, adapté aux URL.
- `source_doc` et `source_manifest` en chemins relatifs : les génomes redeviennent
  portables entre machines et systèmes.
- `content_hash` de chaque `.dna` a changé : il reflète la nouvelle provenance.

### Négatives / coûts

- **Changement d'identité des génomes** : tous les `content_hash` et `genome_ref` ont
  changé. Les enregistrements SQLite existants (`agent_genomes`) font l'objet d'un upsert
  par `id` (nom) ; les lignes obsolètes doivent être purgées par réimport.
- Rupture des liens externes pointant vers les anciens chemins.
- Nécessite de maintenir la discipline : tout futur déplacement est une migration.

## Alternatives écartées

- **Hub seul, fichiers à plat** (sans déplacement) : corrige la découvrabilité mais pas
  la hiérarchie ; laissait `UPPER_SNAKE` et 58 fichiers à plat.
- **Garder les chemins scellés et créer des alias** : complexifie sans nécessité et
  laisse deux sources de vérité.
- **Ne rien recompiler** : aurait laissé 227 génomes pointant vers des fichiers
  inexistants — inacceptable au regard de la règle « ne jamais feindre le succès ».
