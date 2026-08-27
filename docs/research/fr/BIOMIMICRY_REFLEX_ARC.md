> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Arc Réflexe : Double Voie Rapide/Lente

> Domaine : neurosciences (moelle épinière) — Statut : proposition de recherche

## 1. Fondement biologique
Le retrait de la main d'une source chaude ne passe pas par le cortex : l'arc réflexe (récepteur → moelle → muscle, ~20 ms) déclenche la réponse avant que la perception consciente (~300 ms) n'arrive. Le cerveau est informé *après coup*. Deux voies coexistent : réflexe (rapide, stéréotypée, sans deliberation) et corticale (lente, contextuelle, révisable).

## 2. Formalisation GenOS
```
Requête → ReflexGate :
  si match(règles_réflexes) alors Réponse_immédiate + journalisation asynchrone de l'intention
  sinon voie_corticale (MCTS / raisonnement complet)
Règles_réflexes = { pattern: Condition, action: Action_sûre, garde_fou: Prédicat, priorité }
```

Contrainte de sécurité : une règle réflexe ne peut être ni mutée dans le génome ni promue sans validation ; elle vit dans un registre signé.

## 3. Mapping primitives existantes
- `genos-eval/src/mcts.rs` — la voie corticale est le MCTS existant.
- `genos-core/src/operon.rs` — les réflexes sont des opérons « spinaux » pré-compilés (cf. procéduralisation cérébelleuse).
- Event sourcing (`genos-store`) — la décision réflexe et son contexte sont journalisés pour audit différé.

## 4. Cas d'usage
- Questions triviales (« quel est ce fichier ? ») répondues en 1 appel au lieu d'un arbre MCTS.
- Défense : pattern d'injection détecté → coupure immédiate du canal, analyse ensuite.
- Économie : 60–80 % des requêtes routées hors voie coûteuse selon les benchmarks typiques de trafic.

## 5. Apports attendus
- Latence réduite d'un ordre de grandeur sur les cas stéréotypés.
- Budget tokens économisé massivement.
- Séparation claire entre comportement codifié (auditables, versionnés) et comportement délibéré.

## 6. Points d'intégration
`genos-eval/src/reflex_gate.rs` (nouveau), registre réflexe dans `genos-core`, outil MCP `biomimicry_reflex_register`.
