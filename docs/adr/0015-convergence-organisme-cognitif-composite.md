# ADR 0015 — Convergence d'un organisme cognitif composite

- Statut : Accepté
- Date : 2026-09-16
- Domaine : Orchestration, contrôle, preuve, sûreté
- Décideurs : Équipe GenOS
- Lié à : [régulation multi-boucles](../02-orchestration/regulation-multi-boucles.md), [théorie du soi](0014-theorie-du-soi-operationnelle.md)

## Contexte

Les capacités biomimétiques de GenOS existaient dans plusieurs couches, mais
aucun contrat commun ne montrait leur contribution à une décision. Les décrire
comme des traits humains ou vivants sans signal, variable et effet vérifiables
aurait produit un anthropomorphisme narratif.

## Décision

Traiter l'humain comme un point de convergence partiel, pas comme un modèle à
imiter. La décision centrale reste une régulation multi-boucles qui compose des
contraintes cognitives, animales, vivantes, écologiques et physiques.

Chaque plan expose une matrice de neuf axes avec score, base d'observation et
preuves. Les valeurs absentes sont marquées `unobserved`; aucun récit ne complète
une donnée manquante. Le score agrégé est informatif et ne peut lever aucun gate.

L'arbitrage traduit les signaux en `execute`, `probe` ou `blocked`. Un contexte
incertain ou risqué impose une sonde réversible; risque et incertitude élevés
imposent en plus une revue humaine. La politique runtime interdit les éditions
en mode `probe` et maintient la preuve obligatoire avant promotion.

## Conséquences

Positives : la convergence devient inspectable, falsifiable et reliée à un effet
d'exécution. Les capacités absentes restent visibles au lieu d'être simulées.

Négatives : certains axes utilisent encore des proxys conservateurs. Le score
n'est pas une mesure d'intelligence générale et ne compare pas des organismes.

## Alternatives

- Persona humanisée : rejetée, car le style verbal ne démontre aucun contrôle.
- Score unique sans détail : rejeté, car il masque les capacités absentes.
- Remplacement des gates par la matrice : rejeté, car une convergence élevée
  n'est pas une preuve de correction ni de sûreté.