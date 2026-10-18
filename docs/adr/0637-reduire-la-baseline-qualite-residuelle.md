# ADR 0637 — Réduire la baseline qualité résiduelle

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : qualité, preuves, gouvernance de dette
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0344, plan de maturité des principes fondateurs vers 95/100

## Contexte

Le gate global observait 21 violations, dont 6 nouvelles dans le gouverneur de
sortie Node et le contrat de preuve Rust. La baseline versionnée conservait par
ailleurs de nombreuses tolérances pour des violations déjà supprimées. Cette
divergence rendait le périmètre réel de la dette difficile à auditer.

## Décision

Appliquer le refactoring prévu par l'ADR 0344 : extraire les responsabilités du
gouverneur et regrouper les paramètres des opérations de preuve dans des objets
typés, sans réduire les contrôles de validation ou de promotion.

Après réussite du gate global, réduire la baseline à son instantané courant :
15 violations de complexité dans 12 fichiers. N'ajouter aucune tolérance. Assigner
chaque groupe à un domaine et une date de retrait dans le plan de maturité.

Le gate normal doit terminer à zéro et interdire toute croissance. Le mode
`--strict` doit rester rouge tant que la dette résiduelle n'est pas supprimée.

## Conséquences

### Positives

- la baseline décrit uniquement la dette encore observable ;
- les six violations nouvelles sont supprimées sans relever les seuils ;
- les contrats de preuve conservent les refus de transition, de vérification et
  de rejet incomplets ;
- la dette restante devient bornée, attribuée et datée.

### Négatives

- l'API Rust de création et de promotion utilise désormais des structures de
  requête ; les consommateurs externes devront adapter leurs appels ;
- la conformité stricte n'est pas encore atteinte ;
- les dates de retrait nécessitent un suivi explicite.

## Alternatives

Augmenter les seuils ou ajouter les six violations à la baseline est rejeté :
cela masquerait une dette nouvelle. Conserver la baseline obsolète est rejeté :
elle ne représenterait plus l'état courant. Traiter les 15 violations historiques
dans le même commit est rejeté afin de ne pas mélanger plusieurs frontières de
contrôle à risque.
