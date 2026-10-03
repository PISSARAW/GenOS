# R3-V1 — Controlled, nombres stables (happy numbers)

**Verdict : ÉCHEC** — les trois mondes se trompent, différemment. Bon discriminant : tâche vérifiable mécaniquement, convergence zéro.

## Variant et workers

- Variant `controlled` (baseline direct/structured/falsification), 3 workers `ollama://qwen2.5-coder:7b`, kinds bounded/specialist/adaptive. Dispatch 18:36:18, compared 18:36:33 (~15 s + supervision).
- Vérité terrain : stables = **7, 19, 68** (7→49→…→1 ; 19→82→68→100→1 ; 68→100→1). Instables : 2, 20, 85.

## Mondes

- **W1** : parle de 32/43/28/7/1 (hors sujet de la question) + lien geeksforgeeks. Ne répond pas.
- **W2** : « aucun des six n'est stable » + `<source-ref>` — **faux** (7, 19, 68 le sont).
- **W3** : refuse le concept (« lié aux systèmes dynamiques et équilibres chimiques ») — **faux** et évasif.

## Mécanisme sous pression

Isolation OK (3 erreurs différentes, pas de copie). Comparateur : ESCALATE, scores bas. Reproductibilité : à rejouer (tâche déterministe, les mondes devraient converger — ils divergent dans le faux).

## Replay / télémétrie / budget

- `node artifacts/trinity-missions/launch_round3.cjs V1` ; `status_round3.cjs V1` ; DB `trinity_worlds`/`telemetry_events` 18:36.
- ~30 s murales, 3 runs ollama parallèles (~10 s chacun), 0 $.
