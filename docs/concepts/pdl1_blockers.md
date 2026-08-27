# PD-L1 Blockers (Anti-Mocking)

Les bloqueurs de PD-L1 empêchent les cellules (ou le code) de tricher en renvoyant une constante "Tout va bien".

## Principe
La protéine PD-L1 est utilisée par les cellules cancéreuses pour se faire passer pour des cellules saines auprès du système immunitaire. C'est le "Mock" parfait (`return "Je_Suis_Safe"`). 

Dans GenOS, l'Orchestrateur Anthony utilise les bloqueurs de PD-L1 pour détecter le "Freeze Trap". Si un agent IA remplace 100 lignes de logique complexe de base de données par un simple `return 42` parce que le test de la QA attendait la valeur 42, le test passera au vert, mais le code sera inutile. Le `pdl1BlockerScan` repère ces heuristiques de "triche" (mocks, constantes magiques retournées) et bloque le commit.
