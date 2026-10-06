# Organisations qualité-diversité : protocole de laboratoire

Le laboratoire integrations/quality_diversity relie Pyribs et une tâche
ShinkaEvolve limitée à trois poids de score. Il n'est pas appelé par le runtime
de production. Les tableaux fournis sont synthétiques et ne mesurent aucune
mission réelle de GenOS.

## Entrées et séparation

Chaque ligne décrit une mission, un candidat, un budget en tokens, une échéance,
un résultat rapporté, un reçu, la dépense et la latence. Tous les candidats
doivent couvrir les mêmes missions. Les fichiers train.json et holdout.json
sont distincts. L'évaluateur Shinka lit uniquement le premier. Le comparateur
externe sélectionne sur l'apprentissage puis calcule le score de validation.

Pyribs conserve les candidats dans une grille selon le nombre de workers et
la part de vérification. Son archive expose plusieurs configurations, même si
le choix final dépend d'un score. Le champ promotion reste toujours faux ;
GVX doit juger avec ses propres reçus et conditions.

## Exécution

Installer les dépendances du laboratoire dans un environnement isolé avec
integrations/quality_diversity/requirements.txt. Lancer :

    python integrations/quality_diversity/test_lab.py
    python integrations/quality_diversity/archive.py --train integrations/quality_diversity/fixtures/train.json --holdout integrations/quality_diversity/fixtures/holdout.json --program integrations/quality_diversity/shinka/initial.py
    python integrations/quality_diversity/shinka/launch.py --generations 2

La dernière commande valide la configuration sans appel de modèle. Une
évolution demande --run et --model explicites, un environnement isolé, un
budget approuvé et un jeu de validation gardé hors de la tâche. Le candidat
est un littéral PARAMETERS ; l'évaluateur refuse toute autre instruction.

Le score du jeu synthétique baisse de l'apprentissage à la validation. Ce
résultat illustre la nécessité du jeu tenu à l'écart ; il ne prouve ni un gain
de performance ni une causalité sur des missions réelles.

Voir [ADR 0328](../adr/0328-laboratoire-qualite-diversite.md).