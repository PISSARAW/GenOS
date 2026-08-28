# L'Érosion Télomérique (Le Compte à Rebours Cellulaire)

Pour éviter que des processus clonés ou des sous-agents ne se dupliquent à l'infini (créant des boucles exponentielles ou des fuites de mémoire), GenOS implémente le suivi d'état unidirectionnel via les **Télomères**. L'architecture de cette limite (la limite de Hayflick) est définie dans `crates/genos-core/src/biomimicry/telomere.rs`.

## 1. Le Bouchon de Propreté (`TelomereCounter`)
Chaque agent ou capsule "Forkée" (divisée) est instancié avec un budget initial défini (`max_forks`). C'est le fameux bouchon (télomère) qui protège l'ADN (le contexte du système).

## 2. Le Compteur de Division Cellulaire (L'Érosion)
À chaque fois que l'agent invoque la division (pour créer un sous-agent qui va attaquer un problème en parallèle), la fonction `consume_for_fork()` est appelée.
* Le système décrémente `remaining` de 1. C'est une perte physique, irrécupérable.
* Tant que `remaining > 0`, la fonction retourne `ForkVerdict::Allowed`.

## 3. Le Seuil Critique et la Sénescence
Lorsque le télomère arrive à 0, la limite de Hayflick est atteinte.
* Le système renvoie `ForkVerdict::Exhausted`. 
* **Le Suivi Unidirectionnel :** L'agent ne peut plus faire de *fork*. Il n'est pas tué (il n'entre pas en apoptose), mais il entre en **sénescence**. Il peut terminer sa tâche en cours, répondre aux requêtes, mais sa lignée de duplication s'arrête net.

Ceci est un mécanisme de **Contrôle Qualité**. Il force le système à renouveler son bassin génétique (créer un agent tout neuf à partir d'un prompt racine propre, ou par "Breeding") plutôt que de copier indéfiniment une instance qui pourrait avoir accumulé des erreurs, du contexte pollué (cancer de contexte) au fil de ses duplications.
Seule la `telomerase_restore` peut forcer l'ajout de budget, mais cette fonction est hyper-sécurisée et plafonnée pour éviter "l'immortalisation" involontaire d'un agent défectueux.
