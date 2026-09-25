# ADR 0102 — Impact des symbiontes keystone

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Holobionte, résilience, mesure de contribution
- **Décideurs** : GenOS
- **Lié à** : ADR 0056, ADR 0060

## Contexte

Un fournisseur unique d'une capacité essentielle est un point de défaillance,
mais la fréquence d'utilisation seule ne mesure pas l'effet réel d'un symbionte.
Un petit traducteur de schéma ou un broker de permissions peut avoir un impact
important même avec peu de trafic.

## Décision

Le service compare deux mesures appariées et documentées : performance du Host
avec le symbionte, puis performance sans lui. L'impact keystone vaut leur différence
et est comparé à un seuil explicite. La fréquence d'usage reste informative et ne
remplace pas cette mesure. Les deux scénarios exigent leurs références de preuve.

## Conséquences

### Positives

- Les fonctions critiques peu utilisées peuvent être identifiées par leur impact mesuré.
- Chaque comparaison conserve les preuves des deux scénarios.

### Négatives

- Une mesure d'ablation demande un benchmark comparable avec et sans symbionte.
- Le seuil est spécifique au contexte et doit être choisi par la policy appelante.

## Alternatives

- Déduire le statut keystone uniquement du trafic ou du nombre de niches : rejeté, car ces signaux ignorent l'impact mesuré.
