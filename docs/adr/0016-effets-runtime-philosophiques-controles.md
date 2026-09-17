# ADR 0016 — Effets runtime philosophiques contrôlés

## Décision

`genos_philosophy` conserve des évaluations sans effet de bord et expose une
opération séparée `applyRuntimeEffect`. Cette opération n'accepte qu'un effet
dans une allow-list, exige `concept`, `agentId` et `apply: true`, puis émet un
événement de télémétrie auditable. Sans `apply: true`, elle retourne seulement
un aperçu.

## Effets autorisés

- `require_evidence` : signaler qu'une preuve est requise ;
- `hold_promotion` : signaler qu'une promotion doit rester suspendue ;
- `prefer_observation` : signaler une préférence pour l'observation.

Les effets ne modifient pas directement le code, les fichiers ou les droits
MCP. Leur consommation par un contrôle runtime ultérieur doit rester soumise
aux barrières d'autorité et d'évidence existantes.
