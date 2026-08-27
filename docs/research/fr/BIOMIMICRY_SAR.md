> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Résistance Systémique Acquise (SAR) : Immunité Mémoire des Plantes

> Domaine : physiologie végétale (SAR) — Statut : proposition de recherche

## 1. Fondement biologique
Les plantes développent après une première infection locale une **résistance systémique acquise** : une signalisation (acide salicylique, signal mobile) met l'ensemble de la plante en état de défense renforcée **durable** (semaines), même dans les parties jamais infectées. Contrairement aux animaux, pas de cellules mémoire dédiées : c'est un état systémique persistant, transmissible en partie à la descendance.

## 2. Formalisation GenOS
```
SAR(système) :
  Amorçage : incident résolu + analyse causale validée → « signature d'amorçage » signée
  État systémique durable : politiques de sécurité durcies (primes sur vérifications, seeds de détection enrichies)
                            stockées au niveau configuration système (pas capsule)
  Persistance : l'état survit aux redémarrages ; décroît très lentement (moitié-vie longue)
  Hérédité partielle : les nouveaux agents naissent avec les amorçages hérités (marqueurs épigénétiques)
```

## 3. Mapping primitives existantes
- `epigenetics.rs` — les amorçages héritables sont des marqueurs épigénétiques de défense.
- Replay causal — produit la signature d'amorçage validée.
- Interférons (doc sœur) — SAR = version durable et systémique du signal bref.

## 4. Cas d'usage
- Après avoir repoussé une campagne d'injection, GenOS reste « armé » des semaines : tout nouveau pattern proche déclenche une réponse anticipée.
- Les agents créés après l'incident naissent déjà amorcés contre cette classe de menace.

## 5. Apports attendus
- Mémoire de sécurité longue durée, documentée et rejouable (chaque amorçage pointe vers son incident).
- Protection des composants n'ayant jamais vu la menace.
- Complète la chaîne : vaccination (proactive, ciblée) → interférons (réactif bref) → SAR (réactif durable).

## 6. Points d'intégration
`genos-core/src/resilience/sar.rs` (nouveau), extension `epigenetics.rs`, outil MCP `resilience_sar_prime`.
