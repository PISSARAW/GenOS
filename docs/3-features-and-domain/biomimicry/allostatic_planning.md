# Allostatic Planning (Codage prédictif & Allostasie)

## Concept

Allostasis is the biological process of maintaining stability through anticipating needs before they arise, minimizing wasteful energy expenditure. 

In GenOS, **Allostatic Planning** replaces the traditional "Planning Mode". Before blindly burning metabolic energy (LLM tokens) on execution, the agent launches predictive simulations (predictive coding).

## Implementation

- **Core Module**: `crates/genos-core/src/biomimicry/allostatic_planning.rs`
- **CLI Command**: `genos bio-feature allostatic plan`
- **MCP Tool**: `genos_allostatic_planning`

## Mechanism
1. The agent predicts an action, its expected outcome, and its metabolic cost.
2. It collects evidence (simulated or gathered from active sensing) to score the viability of the prediction.
3. Tokens are only expended once the allostatic model reaches a threshold of viability, ensuring metabolic efficiency.
