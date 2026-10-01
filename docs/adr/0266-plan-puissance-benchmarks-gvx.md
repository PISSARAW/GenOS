# ADR 0266 — Plan d'analyse et puissance dérivée des benchmarks GVX

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, benchmarks, réplication, inférence
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0035, ADR 0251

## Contexte

Le protocole de benchmark imposait deux seeds au minimum, quel que soit l'effet recherché
ou la variance supposée. Ce plancher ne permettait pas de dimensionner une réplication ni
d'étayer une conclusion de supériorité.

## Décision

Tout nouveau manifeste déclare l'indicateur primaire, son sens, l'effet minimal pertinent,
la variance supposée, le niveau de confiance et la puissance cible. `requiredReplicates`
utilise l'approximation normale pour deux groupes indépendants et impose au moins le
plancher technique `minSeeds`. Chaque variante, cohorte et split doit disposer du nombre
dérivé de seeds.

Le score maintient `comparisonAuthority: none`; respecter le plan ne constitue ni une
comparaison d'hypothèses complète ni une affirmation de supériorité. L'estimation de
variance doit être justifiée par un pilote ou des données antérieures.

## Conséquences

- Deux seeds ne satisfont le protocole que si le plan de puissance dérive au plus deux
  réplications; un résultat ne peut pas conclure à une supériorité pour ce seul motif.
- Un effet minimal pertinent et une variance initiale sont préenregistrés au manifeste.
- Les baselines MBH-like et Lipson-like et l'exécution des campagnes restent des étapes
  distinctes.

## Alternatives

- Imposer arbitrairement trente seeds : rejeté, car la taille dépend de l'effet et de la
  variance attendus.
- Garder deux seeds comme seuil de conclusion : rejeté, car cela confond un minimum
  exécutable et une réplication suffisamment puissante.
