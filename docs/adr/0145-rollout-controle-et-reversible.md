# ADR 0145 — Rollout contrôlé et réversible

Les branches contrefactuelles sont classées sur l’observation réelle. Le delta
composé est calculé avant sélection, chaque choix reçoit un état avant et un
token de rollback, et une divergence observée déclenche le repli. Un policy
flip reste explicitement réversible.
