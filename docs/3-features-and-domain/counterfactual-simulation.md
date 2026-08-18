# Le Rejeu Contrefactuel (Counterfactual Simulation)

Dans la théorie de la causalité (notamment les travaux de Judea Pearl sur l'Inférence Causale), une question contrefactuelle prend la forme : "Que se serait-il passé si, sachant ce que je sais maintenant, j'avais pris une décision différente dans le passé ?"

Appliqué à l'ingénierie des agents IA (et implémentable via des plateformes comme GenOS), le Rejeu Contrefactuel est la capacité de simuler informatiquement des univers parallèles (What-If scenarios) pour auditer, déboguer ou prouver la robustesse d'un système.

## 1. Différence avec le Forking classique

Le Forking simple consiste à séparer une trajectoire en cours pour explorer deux futurs possibles. Le Rejeu Contrefactuel est une analyse rétrospective. Il s'agit de reprendre une trajectoire déjà terminée (qu'elle soit un succès ou un échec), d'inverser une seule variable causale dans le passé, et d'observer si le résultat final change de manière significative.

**Exemples de questions contrefactuelles :**
- "Si le développeur humain n'avait pas corrigé l'orthographe de la variable à l'étape 3, l'IA aurait-elle quand même réussi à déployer le serveur à l'étape 10 ?"
- "Si l'API de base de données avait renvoyé une erreur de latence (HTTP 503) à l'étape 5, le code de gestion de fallback de l'IA se serait-il bien activé ?"

## 2. Utilité MLOps du Rejeu Contrefactuel

### A. Débogage de Causalité (Root Cause Analysis)
Lorsqu'un système IA échoue gravement, les ingénieurs peuvent utiliser le rejeu contrefactuel pour prouver la cause racine. Si vous suspectez que le prompt système X est la cause du plantage, vous créez une simulation contrefactuelle où le prompt X est remplacé par Y. Si la simulation réussit, vous avez prouvé mathématiquement la causalité de l'échec, et non une simple corrélation.

### B. Validation d'Assomptions (`genos_invalidate_assumption`)
Souvent, les modèles d'IA prennent des raccourcis en formulant des hypothèses (Assumptions). Par exemple : "Je suppose que le port 8080 est toujours libre". Le rejeu contrefactuel permet d'invalider cette hypothèse de manière automatisée. Le moteur de test rejoue la trajectoire dans un monde virtuel où le port 8080 est occupé (Chaos Engineering). Si l'agent IA panique et crashe, la trajectoire est déclarée fragile.

### C. Évaluation de Robustesse (Adversarial Review)
Les équipes de sécurité utilisent la simulation contrefactuelle (via des outils comme `genos_security_coevolution`) pour attaquer les décisions passées de l'IA. Elles modifient rétrospectivement un paramètre d'entrée (ex: en injectant un prompt malveillant) pour vérifier si la trajectoire aurait pu être détournée.

## 3. Le défi technique : Le Déterminisme

Le rejeu contrefactuel n'a de valeur scientifique que si le système garantit l'Isolation Causale et le Gel de l'Entropie. En effet, pour prouver que le changement de la variable X est la seule cause du nouveau résultat Y, il faut garantir que 100% des autres variables (GPU, Load balancer, Température du LLM) soient restées strictement identiques (Ceteris Paribus) lors du rejeu.

> [!IMPORTANT]
> **Synthèse**
> Le Rejeu Contrefactuel est l'outil ultime de la Science de l'IA. Il permet de passer de la question "Comment l'IA s'est-elle comportée aujourd'hui ?" à la question "Comment l'IA se serait-elle comportée si le monde avait été différent ?". C'est ce qui transforme un prototype probabiliste en une infrastructure critique certifiable.
