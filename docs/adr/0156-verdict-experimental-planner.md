# ADR 0156 — Verdict expérimental et planner

Un verdict ne peut recommander une transition du planner que s’il porte un
reçu causal et le contexte du protocole/manifeste. La recommandation PID expose
erreur, intégrale et dérivée; un contexte absent bloque la transition.
