# ADR 0642 — Borner les heuristiques et les garanties AEIS

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : AEIS, calibration, diversité, preuve, indépendance
- **Décideurs** : GenOS
- **Lié à** : ADR 0097, ADR 0205, ADR 0294, ADR 0296

## Contexte

AEIS exposait les poids et seuils de pression comme un modèle mathématique sans
artefact de calibration empirique. Sa documentation publiait aussi une formule
de diversité différente du code et un seuil de monoculture à `0.3` sans vérité
terrain. Enfin, la variété de providers et les réponses contrôlées pouvaient être
lues comme une indépendance épistémique, alors que le gate ne promeut que deux
formes de prédicats de commande exacts.

## Décision

- La pression AEIS est une politique d'ordonnancement versionnée. Ses poids et
  frontières par défaut sont déclarés non calibrés, configurables et dépourvus
  d'interprétation probabiliste.
- La diversité observée devient la moyenne bornée de sept composantes publiées :
  richesse, niches, erreurs, outils, providers, stratégies et équilibre de
  Shannon. La richesse contribue explicitement et augmente quand une espèce
  distincte est ajoutée. L'indice reste descriptif.
- La monoculture est détectée par défaut avec trois minima structurels : deux
  types, deux niches et deux stratégies. Un seuil scalaire n'est opposable que
  lorsqu'une politique calibrée le fournit explicitement.
- Les claims sont séparés entre prédicats de commande mécanisables, claims de
  domaine en attente d'un oracle externe et claims sémantiques libres non
  promouvables automatiquement.
- La variété de providers ou de processus ne vaut jamais indépendance. Les
  fixtures contrôlées qualifient le protocole, pas la vérité des verdicts. La
  sélection clonale reste en attente sans oracle extérieur admissible.

## Conséquences

### Positives

- Les garanties documentées correspondent à ce que les tests exécutent.
- Les seuils non validés ne sont plus présentés comme des mesures d'efficacité.
- L'ajout d'une espèce distincte peut augmenter l'indice publié, sans confondre
  richesse, équilibre et indépendance.
- Les claims non mécanisables échouent honnêtement au lieu de recevoir une preuve
  textuelle fabriquée.

### Négatives

- Les scores historiques ne sont pas directement comparables à la politique de
  diversité `v2`.
- AEIS couvre un domaine plus étroit que l'épistémologie générale des agents.
- Une calibration utile exige des jeux de données avec vérité terrain et une
  mesure explicite des faux positifs, faux négatifs, coûts et abstentions.

## Alternatives

- Conserver les seuils et ajouter seulement une note : rejeté, car le seuil
  implicite continuait à piloter le runtime.
- Traiter l'accord multi-provider comme une preuve : rejeté, car des modèles
  distincts peuvent partager données, méthodes et erreurs.
- Accepter un jugement de LLM comme oracle pour les claims sémantiques : rejeté,
  car cela réintroduit précisément l'auto-validation que le gate doit empêcher.
