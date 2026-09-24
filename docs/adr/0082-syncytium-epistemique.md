# ADR 0082 — Variant Épistémique pour Syncytium

## Statut

Accepté — lot 21 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, claims partagés, preuves et réfutations.

## Lié à

Phase 39 de la feuille de route Syncytium.

## Contexte

Un état épistémique partagé doit conserver les propositions concurrentes et les éléments qui les soutiennent ou les réfutent. Un registre LWW de chaînes ferait disparaître cette pluralité.

## Décision

1. Représenter `claims`, `evidence`, `refutations` et les estimations `uncertainty` par des `ADD_WINS_SET` append-only.
2. Exiger des claims un identifiant, une proposition, un type reconnu et un auteur.
3. Exiger des preuves et réfutations un claim lié, un identifiant, une catégorie d'évidence et un payload structuré.
4. Représenter l'incertitude comme une série d'estimations bornées de 0 à 1, attribuées à leur auteur et à leur méthode.
5. Rejeter sémantiquement les preuves, réfutations ou estimations qui ne référencent pas un claim existant.

## Conséquences

### Positives

- Les claims concurrents, preuves favorables et contre-preuves restent disponibles ensemble.
- L'incertitude est traçable par auteur et méthode au lieu d'écraser les autres estimations.
- Les valeurs épistémiques réutilisent les types CRDT et les contrôles de conflit du runtime partagé.

### Négatives

- Ce lot ne calcule pas de score de confiance agrégé et ne décide pas de la vérité d'un claim.
- Les ensembles sont append-only; le retrait ou la dépréciation exige une politique de cycle de vie ultérieure.

## Alternatives

- Stocker le claim courant comme chaîne LWW : écarté, car les mises à jour concurrentes masqueraient le désaccord.
- Agréger immédiatement les preuves en une confiance unique : écarté, car cette agrégation perdrait la provenance et l'incertitude des évaluateurs.
