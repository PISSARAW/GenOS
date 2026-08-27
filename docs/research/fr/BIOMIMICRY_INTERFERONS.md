> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Interférons : Alerte Préventive des Capsules Voisines

> Domaine : immunologie (signalisation antivirale) — Statut : proposition de recherche

## 1. Fondement biologique
Quand une cellule détecte un virus, elle sécrète des **interférons** : les cellules voisines, avant toute infection, entrent en état antiviral (dégradation de l'ARN étranger facilitée, présentation augmentée). Le voisin est prévenu *avant* d'être contaminé — la défense se propage plus vite que l'agent pathogène. C'est un signal paracrin bref et puissant.

## 2. Formalisation GenOS
```
Interferon(capsule c, signature s) :
  Déclencheur : détection confirmée de s dans c
  Diffusion : broadcast aux capsules du même monde / même lignée / même opérateur humain (rayon limité)
  Effet récepteur : état_antiviral pendant T = {sensibilité détecteurs ↑, écritures externes gelées,
                    journalisation verbeuse, refus des entrées non signées}
Décroissance : l'état expire naturellement ; re-émission si nouvelle détection.
```

Différence avec inflammation (globale) et hormones (lentes) : interféron = **paracrin, bref, immédiat**, ciblé sur le voisinage à risque.

## 3. Mapping primitives existantes
- `cyber_immune.rs` — source des signatures détectées.
- `organization/network.rs` (gossip mycorhizien) — transport naturel du signal.
- `genos-world` (isolation CoW) — le gel des écritures est trivial dans ce modèle.

## 4. Cas d'usage
- Une capsule détecte une injection réussie : ses sœurs de la même flotte durcissent leurs entrées en millisecondes, avant que l'attaquant ne pivote.
- Contamination d'un dataset partagé : toutes les capsules consommatrices passent en mode vérification renforcée.

## 5. Apports attendus
- Vitesse de défense supérieure à la vitesse de propagation des menaces.
- Granularité fine (voisinage) évitant le coût d'une inflammation globale.
- Traçabilité : chaque émission/réception d'interféron est un événement auditable.

## 6. Points d'intégration
`genos-core/src/resilience/interferon.rs` (nouveau), branchement gossip `network.rs`, outil MCP `resilience_emit_interferon`.
