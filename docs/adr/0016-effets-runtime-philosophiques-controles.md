# ADR 0016 — Effets runtime philosophiques contrôlés

- **Statut** : Accepté
- **Date** : 2026-09-17
- **Domaine** : Philosophie, runtime, sûreté

## Contexte

Le registre philosophique fournit des évaluations utiles à l’orchestrateur et
aux workers, mais une évaluation ne doit pas muter implicitement l’exécution.
Il faut distinguer une analyse documentaire d’un signal pouvant influencer une
barrière runtime.

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

## Conséquences

### Positives

- l’aperçu est sans effet de bord et reproductible ;
- toute application produit une trace de télémétrie et un receipt ;
- l’allow-list limite le blast radius et interdit les actions d’orchestration.

### Négatives

- un consommateur runtime doit encore décider comment traiter le signal ;
- ces signaux ne constituent pas une preuve philosophique ou métier ;
- l’opération nécessite un agent explicitement identifié.

## Alternatives écartées

- appliquer automatiquement un effet lors de `evaluateConcept` ;
- autoriser un nom d’effet arbitraire fourni par l’appelant ;
- modifier directement le statut d’un agent ou les fichiers du workspace.
