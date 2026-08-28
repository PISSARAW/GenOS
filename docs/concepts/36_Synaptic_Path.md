# Le Chemin Synaptique (Synaptic Path)

Le **Chemin Synaptique** (Synaptic Path) dans GenOS est un modèle à 3 niveaux reproduisant la plasticité neuronale biologique. Plutôt que de stocker un simple "poids" scalaire (comme dans les réseaux de neurones classiques), GenOS simule l'état physico-chimique d'une connexion entre deux concepts.

## 1. Niveau 1 : Le Passage Transitoire (Le "Coucou" Chimique)
* **Biologie** : L'impulsion électrique libère des neurotransmetteurs dans l'espace synaptique.
* **GenOS** : C'est le niveau `Transient`. Un concept est évoqué juste après un autre, créant un pic de signal. Si ce signal n'est pas répété rapidement, les neurotransmetteurs se dissipent (`apply_decay`), et la mémoire s'efface complètement. C'est idéal pour ignorer le bruit contextuel d'un prompt.

## 2. Niveau 2 : Le Renforcement Dynamique (LTP - Long Term Potentiation)
* **Biologie** : Le passage répété et synchronisé force le neurone à faciliter le chemin.
* **GenOS** : C'est le niveau `DynamicLTP`. Si le signal `Transient` dépasse un seuil d'intensité, le chemin passe en LTP. La répétition augmente le niveau de potentialisation. Ce souvenir a un poids suffisant pour attirer l'attention du LLM lors des rappels, mais il est toujours vulnérable à l'élagage (Pruning) pendant le "sommeil" de l'agent.

## 3. Niveau 3 : La Trace Physique
* **Biologie** : Changement structurel durable, comme la création de nouveaux récepteurs (AMPA/NMDA).
* **GenOS** : C'est le niveau `PhysicalTrace`. C'est l'ancrage profond d'un souvenir. Le chemin possède un nombre de `receptors` virtuels et une `efficiency`. Même si l'agent n'utilise plus ce chemin pendant un certain temps (dépression), il faudra une longue période de désuétude (diminution de l'efficacité, puis destruction des récepteurs un à un) pour désapprendre cette information.

---
**Impact sur l'Agent** : 
Lorsqu'un agent GenOS s'endort (fonction Prune & Scale / Loi de Turrigiano), les liaisons faibles disparaissent, tandis que les traces physiques survivent, garantissant une mémoire à long terme robuste sans surcharger la fenêtre de contexte par des hallucinations.
