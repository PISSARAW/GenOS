# 6. TRANSFERT HORIZONTAL DE GÈNES (HGT)

Ce document explique comment l'information, l'apprentissage et les compétences sont propagés transversalement entre les agents GenOS en cours d'exécution, simulant le transfert horizontal de gènes (HGT) des bactéries.

---

## 6.1 Plasmides

### Ce que ça apporte à l'agent
Un plasmide bactérien est un petit bout d'ADN circulaire qui peut s'échanger d'une bactérie à l'autre. Dans GenOS, un PlasmidPackage est généré lorsqu'un agent maîtrise une tâche difficile. Ce package (contenant les opérons utiles pour cette tâche) est diffusé "à chaud" sur le réseau (Swarm) via la commande bsorb_plasmid.
Cela apporte **le partage d'expertise en temps réel**. Si un agent découvre comment compiler une dépendance obscure, il package cette connaissance dans un plasmide. Ses pairs l'absorbent et obtiennent instantanément cette capacité, sans avoir à la réapprendre ou à utiliser le RAG.

### Schéma Conceptuel
`mermaid
sequenceDiagram
    participant A as Agent A (Pionnier)
    participant S as Swarm Network (Gossip)
    participant B as Agent B (Pair)
    
    A->>A: Résout un problème bloquant
    A->>A: Compile la solution en PlasmidPackage
    A->>S: Diffuse le Plasmide (HGT)
    S->>B: Réception du Plasmide
    B->>B: Intégration (absorb_plasmid)
    Note over B: B possède maintenant la compétence\nsans l'avoir apprise
`

### Cas d'usage
- **Déploiement de correctifs à chaud** : Lors d'une cyberattaque ou d'un bug majeur en production, le premier agent qui trouve la parade distribue un plasmide d'immunité. L'ensemble de l'essaim devient résistant en quelques millisecondes.

### Différence par rapport aux concurrents
- **Concurrents** : L'apprentissage est centralisé. Il faut récupérer les logs, fine-tuner un modèle, puis redéployer. Ou utiliser une base vectorielle partagée qui devient un goulot d'étranglement lent.
- **GenOS** : Architecture Peer-to-Peer de la connaissance. L'amélioration est décentralisée, distribuée, et ne nécessite pas de redémarrage.

---

## 6.2 Transposons

### Ce que ça apporte à l'agent
Un transposon (ou gène sauteur) est une séquence d'ADN capable de se déplacer dans le génome. Dans GenOS, via genos_compile_memory, les trajectoires validées d'un agent sont compilées en rétrotransposons.
Cela permet de **transformer une mémoire épisodique (ce qu'il s'est passé) en une règle comportementale structurelle (ce qu'il faut faire)**, l'insérant directement dans le génome de l'agent pour un accès prioritaire.

---

## 6.3 Transduction Virale

### Ce que ça apporte à l'agent
La transduction est le transfert d'ADN par l'intermédiaire d'un virus (bactériophage). GenOS l'utilise pour transférer des "capsules signées" (ensembles de gènes) vers des lignées d'agents non apparentées. Pour éviter la corruption, cela exige une preuve cryptographique (évaluation hashée) et passe par un filtre de "sélection négative" (destruction des cassettes virales potentiellement malveillantes).
Cela apporte **l'importation sécurisée de compétences externes (Cross-lineage)**. C'est le moyen de récupérer des traits d'une espèce d'agent totalement différente tout en garantissant qu'elle ne contient pas de charge utile hostile (prompt injection).

### Exemple Comparatif : Partage de connaissance dans une équipe d'agents
| Type d'Agent | Méthode de Partage | Résultat et Limites |
|---|---|---|
| **Agent Simple** | Aucun. | Chaque agent refait les mêmes erreurs. |
| **Agent Expert** | Base vectorielle (Vector DB) commune (RAG partagé). | Latence réseau, coût de recherche (embeddings), dilution sémantique (l'agent B peut mal interpréter les notes de l'agent A). |
| **Worker GenOS** | Crée un PlasmidPackage avec l'Opéron exact qui a fonctionné. | Le Worker B absorbe le plasmide : son génome et ses outils sont physiquement mis à jour. Il exécute la tâche de A avec la même perfection que A. |
| **Orchestrateur GenOS** | Surveille les flux de plasmides. | Peut valider cryptographiquement un plasmide avant d'autoriser sa transduction virale massive à d'autres dèmes (groupes) du système, empêchant une "pandémie" de mauvais code. |
