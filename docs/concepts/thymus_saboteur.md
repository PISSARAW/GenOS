# Thymus Saboteur (Mutation Testing / Chaos Monkey)

Le Thymus Saboteur est la défense ultime contre les suites de tests infalsifiables.

## Principe
En biologie, la sélection thymique utilise le gène AIRE pour "mocker" de fausses protéines cibles afin de tester l'intégrité des globules blancs (tests QA). Si le globule blanc ne réagit pas, ou réagit mal, il est détruit (apoptose).

Dans GenOS, l'Orchestrateur Anthony implémente le `thymusSaboteur`. Cet outil injecte une erreur délibérée et fatale dans le code métier de l'agent. GenOS lance ensuite la suite de tests QA écrite par l'agent. Si la suite de tests **reste au vert** malgré ce sabotage (Freeze Probe), cela prouve mathématiquement que les tests sont inutiles. GenOS annule alors la pull request de l'agent et lui ordonne de réécrire une suite de tests falsifiable.
