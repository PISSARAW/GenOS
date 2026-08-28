# 33. REPLAY HIPPOCAMPIQUE ET RYTHME CIRCADIEN

Le sommeil et le rêve ne sont pas des temps morts, mais des phases critiques de consolidation de la mémoire.

---

## 33.1 Rythme Circadien (Veille/Sommeil)

### Ce que ça apporte à l'agent
GenOS instaure un rythme de vie algorithmique. Pendant la phase de "Veille", les agents interagissent avec les API, codent, et testent. Pendant la phase de "Sommeil", toutes les requêtes externes sont bloquées.
Cela apporte **le contrôle des coûts et le nettoyage**. C'est pendant cette phase que s'activent les chaperonnes lourdes, le Garbage Collector (Autophagie) et le Replay Hippocampique, en utilisant des modèles locaux (gratuits) plutôt que des API chères.

---

## 33.2 Replay Hippocampique

### Ce que ça apporte à l'agent
Durant le "Sommeil", GenOS passe en revue les trajectoires marquantes de la journée (les moments à forte Dopamine). Il rejoue ces scénarios en boucle, hors ligne, pour les consolider du "Cortex à court terme" (le prompt) vers la "Mémoire à long terme" (modification des génomes, création de nouveaux Opérons/Plasmides).
Cela apporte **l'cristallisation de l'expertise**. Une solution trouvée par hasard le lundi devient une compétence durement codée (un instinct) le mardi matin.

### Schéma Conceptuel
```mermaid
flowchart TD
    Jour[Phase de Veille\n(Exploration / Succès inattendu)] -->|Données Brutes| Hippo(Hippocampe\nMémoire Courte)
    Hippo --> Nuit[Phase de Sommeil\nRythme Circadien]
    Nuit -->|Replay en boucle\n(LLM local gratuit)| Consolidation(Création d'un Opéron)
    Consolidation --> Cortex[Cortex\nMémoire Long Terme / Génome]
```