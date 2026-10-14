# ADR 0484 — Identifier explicitement le candidat du rollout

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : Rollouts canary/A/B et promotion de release.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0482, atomicité des métriques et décisions ; ADR 0483, promotion fondée sur le candidat.

## Contexte

La décision traitait la dernière variante de la configuration comme candidat.
L'API permettait pourtant à l'appelant de fournir les variantes dans n'importe
quel ordre. Un rollout A/B avec `candidate` en première position et `control` en
seconde pouvait donc évaluer et promouvoir le contrôle comme s'il s'agissait du
candidat.

## Décision

La configuration persistée comporte `candidateVariant`. Les valeurs par défaut
continuent d'utiliser `canary` ou `candidate` selon la stratégie. Pour une
configuration personnalisée, l'appelant doit fournir `candidateVariant` si
aucune variante ne porte le nom conventionnel (`canary` ou `candidate`). La
valeur doit correspondre exactement à une variante configurée. Une ancienne
configuration sans identité conventionnelle est mise en pause au lieu de
déduire le candidat de l'ordre du tableau. Les comparaisons et seuils
d'échantillon utilisent cette identité et exigent un échantillon suffisant pour
chaque variante comparée.

## Conséquences

### Positives

- L'ordre de sérialisation ne peut plus changer l'identité de la release candidate.
- Les A/B avec des noms personnalisés échouent à la création si le rôle candidat
  est ambigu.
- Les variantes de contrôle sans échantillon suffisant ne peuvent pas gagner
  par défaut ni provoquer un rollback prématuré.
- Chaque décision renvoie et persiste la variante évaluée explicitement, y
  compris les pauses et les rollbacks SLO.

### Négatives

- Les intégrations A/B personnalisées sans variante nommée `candidate` doivent
  ajouter `candidateVariant`.

## Alternatives

- Continuer à déduire le rôle de la dernière entrée : rejeté, car l'ordre n'est
  pas un contrat de rôle et peut promouvoir le contrôle.
- Exiger des noms réservés `control` et `candidate` : rejeté, car des noms métier
  personnalisés restent utiles si leur rôle est déclaré explicitement.

## Vérification

`node backend/tests/test_release_operations.js` vérifie le refus des rollouts
personnalisés ambigus, l'identité candidate des configurations explicites,
l'indépendance vis-à-vis de l'ordre des variantes, l'attente d'un échantillon
comparatif et le rejet d'erreurs supérieures au nombre de requêtes.
