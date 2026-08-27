# Epigenetic Pointers

Les pointeurs épigénétiques (Epigenetic Pointers) protègent le "Machine-consumed context" sans saturer la fenêtre de contexte de l'agent.

## Principe
L'ADN (le code exécutable exact) ne peut pas être résumé, mais il est physiquement énorme. La biologie utilise la chromatine et des marqueurs chimiques (épigénétique) pour le compacter tout en gardant des pointeurs vers les zones à lire.

Dans GenOS, si un outil MCP renvoie 5000 lignes de JSON brut, l'Orchestrateur Anthony ne l'injecte pas dans le contexte de l'agent. Il écrit le contenu sur le disque local (`.genos/anthony/epigenetic_data_*.json`) et renvoie un pointeur léger à l'agent (`[Pointer: file://...]`). L'agent (ou un autre outil MCP) utilise ce pointeur pour transmettre les données exactes sans jamais devoir les mémoriser.
