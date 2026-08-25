# Biomimétisme & Spéciation Allopatrique : Divergence Contrôlée des Écoles de Pensée

> Domaine : biologie évolutive (spéciation) — Statut : proposition de recherche

## 1. Fondement biologique
La spéciation allopatrique survient quand une population est séparée physiquement (barrière géographique) : sans flux de gènes, les dérives et sélections divergentes mènent à l'isolement reproductif. À la ré-encounter, deux espèces distinctes coexistent — ou ne peuvent plus se croiser. La spéciation sympatrique, elle, diverge *dans le même espace* par spécialisation de niche.

## 2. Formalisation GenOS
```
Speciation(pop P) :
  Allopatrique : isolation durable dans des mondes séparés (`genos-world` distincts) + gel du HGT inter-mondes
                 → divergence mesurée par distance génétique (Cantor) et phénotypique (TraitDivergence)
  Seuil d'espèce : distance > θ ⇒ statut « espèce » : merge inter-espèces interdit ou requiert
                   un protocole hybride explicite (stérilité hybride = enfant non breedable)
  Sympatrique : même monde, spécialisation de niche croissante (ressources disjointes) jusqu'à isolement comportemental
```

## 3. Mapping primitives existantes
- `genos-world` (isolation CoW stricte) — la « barrière géographique » existe déjà.
- `genos-eval/src/forces.rs` — migration/goulets existants ; la spéciation est leur complément (contrôle du flux).
- `genome.rs::distance génétique`, `phylogeny.rs` — mesures de divergence.
- `evolution/breeding.rs` — ajout du statut « stérile » pour les hybrides.

## 4. Cas d'usage
- Faire diverger délibérément deux écoles de stratégie (conservatrice vs agressive) pendant N générations, puis comparer objectivement.
- Empêcher les merges toxiques entre lignées trop divergentes (comme un git merge entre projets incompatibles).

## 5. Apports attendus
- Gestion explicite de la compatibilité génétique : le breeding devient sûr à grande échelle.
- Expériences évolutives longues propres (pas de contamination mutuelle accidentelle).
- Taxonomie vivante du parc d'agents.

## 6. Points d'intégration
Extension `genos-eval/src/forces.rs` (module `speciation.rs`), statut reproductif étendu dans `BreedingStatus`.
