# Système Endocrinien — Neuromodulation Globale

> **Concept biologique** : Système endocrinien — diffusion lente et globale d'hormones dans la circulation sanguine pour moduler les comportements à long terme (stress, confiance, vitesse).
> **Statut** : implémenté (`genos-core::biomimicry::endocrine`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_ENDOCRINE_SYSTEM.md`

## 1. Pourquoi

### 1.1 Le problème : Gestion de flotte rigide
Dans un essaim d'agents (Swarm), changer le comportement global nécessite souvent de reconfigurer chaque agent individuellement, ou de changer le prompt système de tout le monde abruptement.

La biologie utilise les hormones pour diffuser un signal "analogique" à travers tout l'organisme. Un pic de cortisol augmente la focalisation et réduit la prise de risque partout en même temps.

### 1.2 Bénéfices
| Bénéfice | Mécanisme |
|---|---|
| **Contrôle analogique** | Modulation fine des paramètres (température, seuils de confiance) via des niveaux de concentration [0.0, 1.0]. |
| **Effet durable** | L'hormone a une demi-vie (decay) et s'estompe naturellement, permettant un retour au calme sans intervention. |

## 2. Comment

Le `EndocrineSystem` gère le "sang" (bloodstream) de l'essaim.
- **Cortisol** : Augmente le focus, réduit l'exploration (baisse la température du LLM).
- **Adrenaline** : Accélère les heuristiques, réduit la profondeur de l'arbre MCTS pour des réponses rapides.
- **Oxytocin** : Augmente la confiance (abaisse le seuil de consensus pour fusionner avec d'autres agents).

L'orchestrateur "sécrète" l'hormone, qui est lue par les agents. À chaque cycle (ou via CLI), la commande `decay` est appelée pour dissiper les hormones.

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Orchestrateur** | Observe les conditions globales de l'environnement (ex: crise, urgence, succès) et appelle `secrete`. |
| **Worker** | Lit la concentration hormonale du swarm et ajuste ses hyperparamètres locaux de manière autonome. |

## 4. API

### 4.1 CLI
```bash
# Sécréter de l'adrénaline pour accélérer l'essaim
genos biomimicry bio-feature --feature endocrine --action modulate \
  --param swarm_id=swarm_alpha \
  --param endocrine_action=secrete \
  --param hormone=adrenaline \
  --param amount=0.8

# Dissiper les hormones
genos biomimicry bio-feature --feature endocrine --action modulate \
  --param swarm_id=swarm_alpha \
  --param endocrine_action=decay \
  --param decay_factor=0.2
```
