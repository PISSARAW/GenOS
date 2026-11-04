# Contrat de qualité du Dernier Sas intégré

`quality-options.json` contient les options à fournir **avant** la compilation
et le scellement du contrat GQEL. Le lanceur ajoute le brief original dans
`mission` et transmet ces options dans `qualityElevation` à l'orchestrateur.
Ce fichier n'est ni un reçu de qualité ni une mission déjà autorisée.

La durée de vingt minutes est explicite dans `targetMinutes`. Le texte du brief
ne suffit pas à activer l'allocation temporelle : les tentatives précédentes
avaient `targetMinutes: null` et pouvaient produire un plan de soixante minutes.
Le contrat compilé active donc le contrôle existant `duration_supported` et les
défauts de rythme. Il conserve le seuil 80, les deux lecteurs, leur calibration,
les comparaisons dans les deux ordres et les budgets de la campagne précédente.

Le plafond de 16 000 tokens couvre l'enveloppe complète du livrable. Les appels
d'écriture d'une seule scène doivent employer les limites calculées par le
workflow narratif ; ce plafond global n'est pas une cible par scène.

Le lancement intégré doit également exiger les mécanismes de mission, les ADN
signés, les admissions cliniques, le handoff RPE et une transition MORPH réelle.
Ce preset ne les remplace pas. Les artefacts et les clés éphémères restent hors
Git. Une sortie répétitive, tronquée, sans fin ou sans usage mesuré ne devient
jamais un livrable accepté.
