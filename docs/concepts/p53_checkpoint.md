# Checkpoint p53 (Gouvernance Allostérique)

Le Checkpoint p53 traduit les documents légaux et de gouvernance de GenOS en "murs de briques" logiciels.

## Principe
En biologie, les politiques de sécurité (ex: ne pas se diviser si l'ADN est muté) ne sont pas des suggestions. Elles sont implémentées physiquement par la protéine p53 qui bloque l'action mécanique des moteurs cellulaires.

Plutôt que d'écrire des règles de gouvernance (`AGENTS.md`) dans le prompt de l'agent, l'Orchestrateur Anthony implémente la méthode `p53Checkpoint`. Cet intercepteur agit comme un pare-feu *avant* l'exécution des outils (Middleware). 
Il vérifie :
- **Sécurité (Rule 6)** : Blocage d'accès aux `/secrets` sans jeton d'authentification `ADMIN`.
- **Taille (Rule 1)** : Rejet de toute écriture de fichier excédant 400 lignes.
- **Design (Rule 5)** : Blocage des modifications frontend contenant des styles tape-à-l'œil (linear-gradient, emojis).

L'agent LLM ne "décide" plus s'il est compliant, il subit la compliance de manière allostérique.
