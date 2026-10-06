# Sonde causale DoWhy pour SHEV

`assess_effect` requiert une série d'au moins 40 observations avec
`intervention`, `errors` et `traffic`. Le graphe suppose que le trafic affecte
l'intervention et les erreurs, et que l'intervention peut affecter les erreurs.
DoWhy identifie l'effet, l'estime par régression et lance un placebo. Le
résultat reste `exploratory_not_proven` : les hypothèses d'absence de facteurs
confondants non mesurés et de stabilité du traitement restent à établir.

Installer `dowhy==0.14` dans un environnement dédié, puis
`python integrations/dowhy/test_causal_probe.py`. Le jeu du test est
synthétique ; aucun effet causal SHEV réel n'est revendiqué.

Source : [DoWhy](https://github.com/py-why/dowhy).
