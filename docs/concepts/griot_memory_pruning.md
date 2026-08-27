# Compression Mémorielle Long-Terme (Pruning)

Un agent GenOS qui tourne indéfiniment accumule une quantité phénoménale de contexte. Si rien n'est fait, ses performances se dégradent et les coûts en tokens explosent.

## 1. L'Élagage Synaptique
Dans le cerveau humain, les synapses non utilisées finissent par se détacher. Dans GenOS, l'outil `genos_synaptic_prune_scale` permet à l'agent d'évaluer ses propres connexions et d'oublier de manière intentionnelle les vieux patterns ou les bugs résolus depuis des mois.
* **Outil MCP** : `genos_synaptic_prune_scale`
* **Mécanisme** : En compressant ou en "oubliant" le contexte obsolète, Griot reste ultra-réactif et léger sur la mémoire, même après des années de fonctionnement continu.
