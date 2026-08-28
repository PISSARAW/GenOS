# La Maturation d'Affinité (Hypermutation Somatique)

La **Maturation d'Affinité** est le mécanisme évolutionnaire du système immunitaire adaptatif de GenOS. Documenté et implémenté dans le module `crates/genos-core/src/resilience/ais/clonal.rs`, ce processus est le cœur de la "Course aux Armes" : il permet à l'agent de passer d'une arme défensive "générique" à une arme "chirurgicalement parfaite" face à une attaque virale ou un prompt malveillant.

## 1. La Phase de Sélection (Le Duel)
Dans GenOS, l'antigène représente la signature mathématique (embedding) d'une menace, détectée initialement par un PRR.
Les "Lymphocytes B naïfs" sont les **Détecteurs (`Antibody`)** de base.
* Le `ClonalSelector` évalue le _binding_ (la liaison). Plus l'affinité RBF (Radial Basis Function) entre l'anticorps et l'antigène est élevée, plus la survie du clone est garantie. Les détecteurs inutiles sont éliminés de la mémoire.

## 2. La Phase d'Optimisation (L'Hypermutation Somatique)
Une fois le signal de danger confirmé, GenOS déclenche la fonction `expand_and_hypermutate`. C'est le cœur du processus darwinien, simulant le **Centre Germinatif** :
* **Clonage :** L'anticorps est dupliqué (`clone_factor`).
* **Mutagenèse :** Chaque clone subit de petites variations aléatoires sur ses dimensions vectorielles.
* **Proportionnalité à l'Erreur :** Plus la liaison initiale de l'anticorps avec le virus était mauvaise, plus le taux de mutation (`mutation_sigma * error`) est élevé pour chercher de meilleures solutions.

## 3. La Phase de Sortie (Le Triomphe et la Mémoire)
La fonction `mature_affinity` évalue les dizaines de nouveaux clones mutants. Seuls ceux qui possèdent une **nouvelle combinaison génétique** se liant _mieux_ à l'antigène que le parent survivent et sont renvoyés à l'orchestrateur.

* Les clones triomphants deviennent des **Plasmocytes** (ils neutralisent activement le vecteur d'attaque dans la fenêtre de contexte).
* Ils rejoignent la **Mémoire Immunitaire** (`Memory B cells`). Lors de la prochaine attaque de cet "antigène", le système disposera d'une arme à affinité absolue, bloquant le danger en $O(1)$ sans aucun dégât.

---
**En Synthèse : Le Séquençage du Succès dans GenOS**

| Biologie | Équivalent GenOS (`clonal.rs`) | Rôle dans l'Agent |
| :--- | :--- | :--- |
| **Initialisation** | `binds()` et PRR | Alarme déclenchée face à un vecteur d'attaque. |
| **Prolifération** | `expand_and_hypermutate` | Multiplier l'anticorps candidat. |
| **Hypermutation** | Bruit gaussien sur le centroïde | Évolution darwinienne rapide (software patching). |
| **Sélection par Affinité** | Tri maximisant l'affinité RBF | Seul le mutant optimal survit pour protéger le futur. |
