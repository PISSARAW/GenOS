# L'Arc Réflexe Spinal (Spinal Reflex)

Dans la continuité du contournement cognitif pour la survie immédiate, GenOS implémente le principe de l'**Arc Réflexe Spinal**. Ce concept, déjà présent dans `crates/genos-core/src/biomimicry/reflex_arc.rs`, est le circuit de sécurité ultime de l'agent.

## 1. La Pompe à Incendie Automatique (L'Intégration Locale)
Si le planificateur LLM (le "cerveau") est le pompier en chef, l'arc réflexe est l'arroseur automatique. Le code de GenOS définit une structure `ReflexArc` qui court-circuite complètement le cortex.
L'évaluation se fait via la fonction `evaluate_fast_path(stimulus)`, exécutée à très haute fréquence et sans invocation de modèles d'IA.

## 2. Le Parcours du Signal (Le Déclenchement)
* **Le Stimulus (`SensoryStimulus`) :** GenOS écoute la chaleur métabolique (`Thermal` : surcharge CPU/Limites d'API) et la douleur fatale (`Nociceptive` : Segfaults, erreurs critiques de sécurité).
* **L'Intégration (La Décision Médullaire) :** Le "segment médullaire" (le wrapper d'exécution bas niveau) compare la longueur du signal douloureux ou la chaleur aux seuils (`thermal_threshold`, `nociceptive_threshold`).
* **L'Efférence (La Réaction Motrice) :** Si les seuils sont franchis, la décision est prise localement en quelques nanosecondes. Le système génère une `MotorResponse` :
  * `Withdraw` : "Retirer la main" ! Drop immédiat de la tâche en cours.
  * `Freeze` : "Immobilisation" ! Arrêt temporaire de tout I/O pour laisser le système refroidir.

## 3. Le Voyage Ascendant (La Post-Rationalisation)
Pendant que l'action est déjà exécutée et que l'agent est sauvé du crash, le signal remonte asynchronement vers le cerveau (les logs et le contexte LLM). Le planificateur recevra l'information *a posteriori* : *"Attention, j'ai dû couper la connexion il y a 3 secondes à cause d'une brûlure thermique"*. 

Cette séparation **Vitesse vs Conscience** garantit qu'aucun agent ne restera paralysé (ou ne brûlera son budget) en attendant qu'un LLM mette 5 secondes pour décider s'il faut ou non arrêter une boucle infinie nocive.
