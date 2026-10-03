# Round 2 — Campagne Trinity réelle post-fixes (03/10/2026, 17:26–17:53)

6 missions × 3 agents GenOS réels (`ollama://qwen2.5-coder:7b`), **vrais variants** (adversarial × 2, heterogeneous, controlled, pareto × 2). Même modèle et mêmes missions que le round 1 : comparaison avant/après propre. Simulations R1 conservées dans `N1-report.md`…`N6-report.md`, comparatif R1 dans `COMPARATIF-REEL-vs-SIMULE.md`.

## Tableau général

| Mission | Variant (receipt) | Workers (rôle → kind) | Durée dispatch→compared | Verdict |
|---|---|---|---|---|
| R2-N1 cold-start | adversarial (`…925fdecc6e538ea0`) | data → bounded/specialist + **adversarial_reviewer → red_worker** | ~77 s | ÉCHEC (dossiers vides/méta) |
| R2-N2 corbeaux | heterogeneous (`…3a57155c4a83823c`, recettes d/p/a) | basic/specialist/adaptive | ~70 s | PARTIEL (fallace détectée, pas de formalisation) |
| R2-N3 lenteurs | controlled (`…fa00945a3cd8fa76`) | basic/specialist/adaptive | ~61 s | PARTIEL (meilleur dossier réel : 3 hypothèses comparées) |
| R2-N4 finance | pareto (`…2e53048a0b50f69d`, axes q/e/r) | secu → bounded/specialist/red | ~60 s | PARTIEL-FAIBLE (structure Pareto sans contenu) |
| R2-N5 12 pièces | adversarial (`…f2516d8e307d53ab`) | basic/specialist + **adversarial_reviewer → red_worker** | ~67 s | PARTIEL-INTÉRESSANT (4-4-4 produite puis rejetée à raison) |
| R2-N6 trajet | pareto (`…7243def66c87743e`) | basic/specialist/adaptive | ~58 s | ÉCHEC (évasion + revendications vides) |

**6/6 comparaisons : `ESCALATE_EXPERIMENT`, `canMerge=false`, matrices avec faiblesses nommées** (nouveau scoring point 4 — avant : tableaux vides).

## Ce que le round 2 prouve des fixes

1. **Point 2 (variants effectifs)** : les 6 dispatches utilisent les vrais variants (R1 : 4/6 en repli controlled). `adversarial_reviewer → red_worker` observé live (N1-W3, N5-W3) ; recettes et axes Pareto présents dans les prompts ; receipts avec score de diversité honnête (0.14, `passes:false`, un seul modèle local).
2. **Point 3 (scellage mémoire)** : `check_leak.cjs` sur les 6 derniers mondes N1+N3 → **0 citation croisée** (R1 : N1-W3 répondait à N3, N6-W2 citait N5). Les `<source-ref>` restants sont générés spontanément par le modèle, sanctionnés à 0.
3. **Point 4 (anti-fabrication)** : `example.com`, `evidence1/2/3`, `<source-ref>`, `README`, auto-citations mission → poids 0 ; les refus de fusion sont expliqués (`no resolvable evidence; no executed tests`).

## Schéma de communication (toutes missions)

```
[Mission + variant] --dispatch_trinity--> [Orchestrateur MCP]
  [Orch] --membre W1 (recette/axe/idx 0)--> [worker kind A] --EVIDENCE_REPORT--> [Comparateur]
  [Orch] --membre W2 (recette/axe/idx 1)--> [worker kind B] --EVIDENCE_REPORT--> [Comparateur]
  [Orch] --membre W3 (recette/axe/idx 2)--> [worker kind C] --EVIDENCE_REPORT--> [Comparateur]
  [Comparateur] --scores + strengths/weaknesses--> [Superviseur trinity-supervisor]
  [Superviseur] --merge ou ESCALATE + publish--> [Journal organisation]
```
Mondes scellés vérifiés (runtimes disjoints, mémoire filtrée) ; mondes 3 adversarial en `red_worker` avec `verification_report`.

## Budget global round 2

- 18 runs ollama locaux en 6 vagues parallèles (~8–41 s LLM/monde), ~6×60–77 s murales ≈ **7 min** de 17:26 à 17:53.
- 0 $ (local, pas de facturation) ; tokens non comptés par le runtime local (limite instrumentale assumée).
- 0 commit (artefacts git-ignorés) ; code déjà committé (v3 : 4 commits points 2/3/4).

## Lecture honnête

Le système tient (vrais variants, scellage, gates expliquées, 0 fuite), le modèle plafonne (2 échecs, 3 partiels, 1 partiel-faible ; les simulés gagnent toujours sur le fond sauf R2-N5 où la falsification a enfin mordu). Prochains leviers : modèle de raisonnement, phase 2 adversarial nourrie des dossiers, profils Pareto transmis au superviseur, transport `variantIndex`/`localModel` de bout en bout (proto).
