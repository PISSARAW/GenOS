# 9. GÉNÉTIQUE DES POPULATIONS

Ce document montre comment GenOS gère des groupes entiers d'agents (des populations ou "Dèmes") et modélise les forces évolutives à grande échelle.

---

## 9.1 Dérive Génétique et Goulet d'Étranglement

### Ce que ça apporte à l'agent
La fonction genetic_drift_bottleneck simule une catastrophe aléatoire (ex: perte brutale de connexion, crash serveur) détruisant une grande partie des agents, indépendamment de leur "Fitness".
Cela apporte un **test de résilience (Chaos Engineering biologique)**. Cela permet de vérifier si l'essaim peut survivre et reconstituer sa diversité génétique à partir d'un tout petit nombre de survivants.

### Schéma Conceptuel
`mermaid
flowchart TD
    Pop[Population Initiale\n(Très diverse, 1000 agents)] --> Catastrophe(Goulet d'étranglement\nCrash Serveur)
    Catastrophe --> Sur[Survivants Aléatoires\n(10 agents)]
    Sur --> NewPop[Nouvelle Population\nMoins diverse, Dérive génétique]
`

---

## 9.2 Migration, Flux de Gènes et Dèmes

### Ce que ça apporte à l'agent
Dans GenOS, l'essaim peut être séparé en sous-groupes isolés (les "Dèmes") travaillant sur des tâches différentes. La fonction migration_step permet de transférer périodiquement quelques agents d'un Dème à un autre.
Cela apporte le **brassage d'idées (Cross-pollinisation)** et évite la consanguinité intellectuelle (convergence prématurée).

### Exemple Comparatif : Résolution d'un problème complexe en silo
| Type d'Agent | Organisation | Résultat |
|---|---|---|
| **Agents Experts** | Les agents UI travaillent entre eux, les agents DB entre eux. | L'intégration finale échoue car personne ne comprend les contraintes de l'autre. |
| **Worker GenOS** | *(Est le sujet de la migration)* | Apporte sa perspective "DB" dans un Dème "UI". |
| **Orchestrateur GenOS** | Force un flux de gènes (migration) régulier entre les dèmes isolés. | Le Dème "UI" intègre soudainement un gène d'optimisation de requêtes, résolvant un goulot d'étranglement invisible pour eux. |
