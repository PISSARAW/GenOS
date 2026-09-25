# ADR 0105 — Benchmark longitudinal Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Holobionte, évaluation, preuves
- **Décideurs** : GenOS
- **Lié à** : ADR 0035, ADR 0056, ADR 0097

## Contexte

Les capacités résidentes, l'apprentissage des partenaires et la transmission ne
peuvent pas être évalués sur une mission isolée. Les variantes doivent être
comparées sur le même horizon, avec les preuves de chaque résultat.

## Décision

Le benchmark accepte 50 à 100 missions distinctes, dans le même ordre pour douze
bras comparatifs couvrant les approches de base, les ablations et le Holobionte
complet. Chaque exécution doit fournir son succès, son coût, ses tokens, un
vérificateur et des références de preuve. Les métriques symbiotiques sont calculées
quand leurs observations existent; les dénominateurs nuls produisent une valeur
indisponible. Le rapport ne prend aucune décision de promotion.

## Conséquences

### Positives

- Les effets longitudinaux sont comparés sur les mêmes missions.
- La réutilisation, les admissions dangereuses, les erreurs immunitaires, la dépendance, la redondance, la rétention, la dysbiose et le rétablissement restent inspectables.
- Les résultats peuvent être audités grâce aux preuves attachées à chaque exécution.

### Négatives

- Une expérience complète demande au moins 600 exécutions pour douze bras et cinquante missions.
- Le rapport dépend de mesures fiables fournies par le banc d'essai appelant.

## Alternatives

- Déduire un gain longitudinal de résultats isolés ou non appariés : rejeté, car les différences de missions brouillent l'effet des variantes.
