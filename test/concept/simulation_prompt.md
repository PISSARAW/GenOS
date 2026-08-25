# Prompt de Simulation des Concepts GenOS

*Ce fichier contient le prompt exact que vous pouvez copier/coller dans votre LLM (ChatGPT, Claude, etc.) pour lui demander de simuler et comparer les mécaniques de GenOS.*

---

**Copiez le texte ci-dessous et envoyez-le à votre LLM :**

```markdown
Tu es un expert en architectures multi-agents et tu connais parfaitement les concepts de GenOS (Genome Operating System). 

Ta tâche est de simuler l'exécution d'un scénario complexe pour démontrer la supériorité de l'approche GenOS (Génétique, Mutation, Recombinaison) par rapport aux approches classiques. 

Pour chaque concept (1 à 3), tu vas créer et simuler le comportement de 4 types d'agents :
1. **Un Agent Simple** (qui utilise juste un prompt basique)
2. **Un Agent Expert** (qui utilise un prompt d'expert très détaillé)
3. **Un Worker GenOS** (qui utilise le CLI GenOS avec son génome)
4. **Un Orchestrateur GenOS** (qui gère l'essaim via le CLI GenOS)

L'utilisateur utilise GenOS **strictement via le CLI** (`genos`). Tu dois donc inclure les commandes CLI pertinentes dans la simulation des agents GenOS (ex: `genos agent run`, `genos biomimicry swarm`, etc.).

Voici les 3 concepts à simuler :

### Concept 1 : Génétique Fondamentale
**Tâche :** Refactoriser un composant critique de paiement sans tests existants.
- Montre le prompt de l'Agent Simple et son résultat (échec/oubli).
- Montre le prompt de l'Agent Expert et son résultat (succès fragile).
- Montre la commande CLI `genos agent create ...` (définissant `risk_tolerance` et `syntax_strictness`) et `genos agent run ...` pour le Worker GenOS, puis explique comment son phénotype le bloque par sécurité.
- Montre la commande CLI `genos biomimicry swarm ...` pour l'Orchestrateur, et comment il choisit le bon profil génétique.

### Concept 2 : Mutation
**Tâche :** Le code est rejeté en boucle par un linter extrêmement strict.
- Montre l'Agent Simple qui boucle et s'excuse.
- Montre l'Agent Expert qui subit une surcharge de contexte (RAG).
- Montre le Worker GenOS face au blocage. Simule la commande CLI que le système exécute en interne pour muter l'agent (`genos agent mutate --gene syntax_strictness --value 0.9`) et explique comment l'agent passe le linter en O(1) de contexte.
- Montre comment l'Orchestrateur récupère cette lignée mutée pour les autres tâches.

### Concept 3 : Recombinaison & Reproduction
**Tâche :** Créer un algorithme de cryptographie nécessitant à la fois une optimisation de performance extrême et une sécurité parfaite.
- Montre l'Agent Simple qui dilue son attention et échoue sur un des deux fronts.
- Montre l'essaim classique (Agents Experts) qui s'épuise en allers-retours très coûteux en tokens.
- Montre l'Orchestrateur GenOS utilisant la commande `genos division breed --parent-a "Expert_Securite" --parent-b "Expert_Performance" --strategy homologous` pour créer un Enfant Hybride. Explique pourquoi cet enfant accomplit la tâche seul, divisant le coût par deux.

À la fin de chaque concept, fais un bref paragraphe de conclusion pour comparer le résultat obtenu à la mécanique attendue définie dans la documentation de GenOS.
```
