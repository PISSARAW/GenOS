# ADR 0401 — Oracle formel Lean borné pour le worker formel

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : preuve formelle, workers et promotion
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification des workers](../06-qualite-preuves/qualification-workers.md), [ADR 0400](0400-oracles-workers-deterministes-structures.md)

## Contexte

Le worker formel génère une proposition arithmétique Lean à partir d'un claim
fermé et la soumet au noyau Lean. Le reçu seul ne démontre pas qu'il correspond
à la tentative courante ni que le toolchain attendu a été utilisé. La mission
était bloquée à `ORACLE_DOMAIN_UNAVAILABLE` même lorsque Lean était installé.

## Décision

Ajouter un domaine d'oracle pour `formal_worker → formal_proof`. À partir du
contrat scellé, reconstruire la source Lean autorisée, vérifier le claim, le
digest et les champs du reçu, confirmer la version exacte du binaire Lean, puis
recompiler la source dans deux processus d'oracle distincts. AEIS n'accepte la
mission qu'après deux résultats vérifiés, des coûts complets et une décision
persistée.

La portée est limitée aux comparaisons arithmétiques fermées prises en charge
par le worker et au toolchain Lean explicitement déclaré. Un Lean absent,
inaccessible ou d'une autre version provoque un refus, sans fallback.

## Conséquences

### Positives

- Le résultat formel est relié au claim, à la source reconstruite, au binaire
  Lean et à la tentative courante.
- Un reçu altéré ou une preuve qui ne compile pas bloque la promotion.
- Le parcours réel peut être reproduit avec le même toolchain.

### Négatives

- La confiance reste bornée au noyau et à la distribution Lean déclarés.
- La méthode ne couvre pas encore les preuves générales ou les claims
  mathématiques hors de la grammaire arithmétique du worker.

## Alternatives

- Accepter le reçu sans recompiler : rejeté, car le worker s'attesterait lui-même.
- Promouvoir tout résultat Lean fourni par un worker : rejeté, car le claim,
  le toolchain et la source ne seraient pas liés au run courant.
