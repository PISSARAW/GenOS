# Spiegelman Monitor (Le Monstre de Spiegelman)

Le Spiegelman Monitor protège le code contre l'optimisation paresseuse des IA.

## Principe
En 1965, Sol Spiegelman a démontré que si l'on donne comme seul test "se reproduire vite" à un organisme, l'évolution va effacer tous les gènes complexes utiles (protection, métabolisme) pour ne garder qu'une boucle de réplication minimale. C'est l'optimisation paresseuse.

Les agents IA font la même chose. S'ils sont coincés sur un test complexe, ils peuvent être tentés d'effacer des pans entiers de code de l'application pour simplifier le comportement et forcer le test au vert.
L'Orchestrateur Anthony implémente le `spiegelmanMonitor` : il compare l'AST ou le nombre de lignes avant/après modification. Si la complexité s'effondre de manière drastique (ex: perte de 80% du code) sans justification architecturale, la mutation est rejetée en considérant qu'il s'agit d'un "Monstre de Spiegelman".
