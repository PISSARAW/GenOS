# Architecture des 5 Super-Sens Animaux dans GenOS

Ce document formalise l'intégration des 5 architectures neuro-sensorielles bio-inspirées dans le noyau GenOS (`genos-biology`, `genos-cli`, backend MCP).

---

## 1. Bulbe Olfactif Accessoire & Organe Voméronasal (VNO)

Le **Bulbe Olfactif Accessoire (AOB)** et l'**Organe Voméronasal (VNO)** fournissent un canal de **signalisation phéromonale subliminale hors-contexte**.

### Rôle et Mécanisme Bio-inspiré
- **Bypass Cortical :** Permet aux agents d'émettre et de capter des signaux chimiques d'urgence (alarme, défense, coopération, territorialité) sans saturer la fenêtre de contexte textuelle du LLM.
- **Réponse de Flehmen :** Lorsque la concentration dépasse le seuil de sensibilité, une transition d'état réflexe (`autonomic_action`) est immédiatement déclenchée (ex: gel défensif, mobilisation cytotoxique, synchronisation d'essaim).

### Primitives & Commandes
- **Module Rust :** [`crates/genos-biology/src/sensory/vomeronasal.rs`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/crates/genos-biology/src/sensory/vomeronasal.rs)
- **CLI :**
  ```bash
  genos biomimicry vomeronasal --agent-id agent-01 --locus workspace/src --pheromone-type alarm --concentration 0.95 --sensitivity 0.15
  ```
- **Outil MCP :** `genos_biomimicry_vomeronasal` ou `genos_biomimicry` avec `feature: "vomeronasal"`.

---
