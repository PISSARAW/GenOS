# Régulation Épigénétique & Canalisation

## Le Problème (Liberté versus Format)
En appliquant la **Mue Cognitive** et la **Divergence Cognitive**, nous donnons à nos LLMs locaux une liberté stylistique totale (chaque agent utilise un modèle neuronal physiquement différent).
Le danger de cette hétérogénéité, c'est la perte de format. Si chaque modèle formate l'information à sa façon, les pipelines logiciels en aval (qui attendent un markdown strict ou un JSON strict) vont s'effondrer.

## La Solution Biomimétique : La Canalisation
En génétique, la "canalisation épigénétique" garantit que, malgré d'énormes variations génétiques et environnementales, l'organisme final se développe selon un plan d'architecture invariant (ex: deux bras, deux jambes).

Dans GenOS, nous implémentons ce concept via trois piliers :

### 1. Le Gène Architecte (Injection de Template)
Au lieu de donner des instructions libres, l'Orchestrateur injecte un "squelette" structurel non-négociable dans le prompt. Le modèle garde sa liberté sur le *contenu* (son style d'écriture), mais est physiquement contraint de remplir la *structure* imposée.

### 2. Le Chaperon Markdown (Immunité Structurelle)
La fonction `withTextImmunity()` agit comme une protéine chaperon pour le texte brut. Elle analyse le Markdown rendu par l'agent.
Si le modèle "oublie" une section clé (ex: il manque le sous-titre `## Sources`), le Chaperon déclenche une *Inflammation* et renvoie la trace d'erreur au LLM pour le forcer à respecter le plan d'architecture.
C'est le pont parfait entre liberté cognitive et rigueur algorithmique.

### 3. La Consolidation Mécanique (Post-Processing)
Le code applicatif exécute des Regex de nettoyage (retrait des balises markdown globales, normalisation des espaces) pour lisser les imperfections inhérentes aux LLMs avant l'enregistrement final sur disque.

## Utilisation Transversale (Griot & Autres)
Cette architecture n'est pas limitée à la A-Team. **Griot** utilise implicitement cette canalisation épigénétique pour interagir avec l'utilisateur via l'interface UI. La règle stricte de formater les réponses en listes à puces et de bloquer les modifications de fichiers dans un encart JSON `\file_modifications` est une forme de Canalisation, garantie par le moteur d'exécution et surveillée par les validations du frontend.
