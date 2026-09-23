# Benchmark écologie de communication (Phase 14)

Compare 4 bras sur 3 échelles, mondes seedés reproductibles :

| Bras | Description |
| --- | --- |
| A | LLM naïfs, diffusion textuelle à tous (modèle exact en comptes) |
| B | GenOS zero-text actuel (broadcast + récepteurs, sans sélection) |
| C | GenOS + PolicyEngine + CommonGround (ce repo, shadow mode réel) |
| D | C + dialectes + verbal borné (ce repo, shadow mode réel) |

Scénarios : `S` (10 agents / debugging), `M` (100 / investigation),
`L` (1000 / recherche distribuée). Ablations (7) sur M, bras D en référence.

## Usage

```bash
node benchmarks/communication-ecology/run-benchmark.cjs --scenario=S|M|L|all
```

Sortie : table console + `results/run-<ts>.json` (artefact généré, non commité).

## Ce qui est mesuré exactement

Comptes structurels, lus sur l'état monde ou produits par les vrais
services : décisions par action, SILENCE, destinataires, variantes par
classe, appels LLM (bras A, par construction), wakeups verbaux, messages
transport, fanout cognitif, redondance envoyée/évitée (ledger réel),
succès et succès vérifié (règle capacité ≥ 0.7 + indépendance),
contamination et violations d'indépendance (graphe réel),
`deltaRatio` = empreintes transmises / empreintes naïves (prouve
« ne transmettre que le delta »), wall-clock, unités de coût du modèle
calibré (`communicationCostService`, coefficients expérimentaux).

## Ce qui ne l'est pas

- Tokens LLM : sans modèle dans le harness, `bytesOut` (bras A) reporte
  des BYTES exacts de messages générés, jamais `chars / 4`. Les économies
  de tokens exigent les compteurs fournisseurs (ADR 003x invariant 11).
- Succès mission : proxy structurel (expert capable + vérificateur
  indépendant), pas exécution runtime.
- Latence réseau/LLM : wall-clock locale du moteur déterministe seul.

## Lecture attendue

D doit dominer sur wakeups, fanout, redondance évitée, deltaRatio,
contamination et coût, à succès vérifié constant. Les ablations
désignent la composante responsable de chaque gain.
