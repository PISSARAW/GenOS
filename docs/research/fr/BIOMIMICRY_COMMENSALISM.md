> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Commensalisme : Bénéfice sans Gêne

> Domaine : écologie (relations interspécifiques) — Statut : proposition de recherche

## 1. Fondement biologique
Le commensalisme (+/0) décrit une relation où l'un bénéficie sans nuire ni aider l'hôte : le rémora suit le requin, les oiseaux suivent les charrues. Biologiquement, c'est le stade évolutif instable entre parasitisme (si le commensal commence à coûter) et mutualisme (si l'hôte commence à gagner). La tolérance de l'hôte a des limites (densité critique).

## 2. Formalisation GenOS
```
Commensalisme(A → hôte H) :
  Principe : A consomme les artefacts publics de H (traces de recherche, caches, journaux stigmergiques)
             sans consommer les ressources privées de H ni dégrader ses performances
  Contraintes : lecture seule des artefacts H ; densité_max de commensaux par hôte ;
                mesure continue impact(H) ≈ 0 (sinon requalification : parasitisme)
  Transition explicite : si H tire un bénéfice mesurable de la présence d'A → promotion en mutualisme
```

## 3. Mapping primitives existantes
- Stigmergie (`swarm.rs`, phéromones) — le substrat naturellement exploité par les commensaux.
- `ecosystem.rs::evaluate_niche_competition` — détecter quand +/0 dégénère en compétition −/−.
- CAS Merkle (`genos-store`) — les artefacts sont adressables publiquement sans accès au contexte privé.

## 4. Cas d'usage
- Un agent junior apprend en lisant les phéromones et traces d'un expert senior sans lui poser de questions (zéro interruption).
- Réutilisation des caches de recherche d'une mission antérieure pour une mission connexe.

## 5. Apports attendus
- Économie de travail redondant à coût nul pour les producteurs.
- Vocabulaire relationnel complet dans l'écosystème (−/−, +/−, +/0, +/+ tous modélisables).
- Détection automatique des transitions commensalisme→parasitisme (protection des producteurs).

## 6. Points d'intégration
Extension `genos-eval/src/ecosystem.rs` (matrice d'interactions +/0), politique de densité dans `Biotope`.
