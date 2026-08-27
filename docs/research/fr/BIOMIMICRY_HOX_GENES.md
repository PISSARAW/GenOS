> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Gènes Hox : Ordre Colinéaire des Capacités

> Domaine : biologie du développement — Statut : proposition de recherche

## 1. Fondement biologique
Les gènes Hox déterminent le plan corporel le long de l'axe antéro-postérieur. Leur propriété remarquable est la **colinéarité** : leur ordre sur le chromosome correspond à l'ordre d'expression spatiale/temporelle sur le corps. Ils sont hiérarchiquement organisés (activation en cascade) et hautement conservés évolutivement.

## 2. Formalisation GenOS
Introduire des loci architecturaux `HoxLocus` dont la position dans le chromosome impose un ordre partiel d'activation des capacités :

```
Ordre_activation = tri_topologique(chromosomes par index Hox)
Contrainte : capability_j ne s'active que si ∀ i < j (rang Hox), capability_i ∈ {activée, explicitement désactivée}
```

Exemples d'axes : axe « perception → raisonnement → action », axe « mémoire courte → mémoire longue → consolidation ».

## 3. Mapping primitives existantes
- `genos-core/src/genome.rs::Chromosome / Locus { gene_name, value }` — ajout d'un champ d'index colinéaire.
- `genos-core/src/operon.rs::Operon { promoter, genes }` — un promoteur Hox pilote un bloc d'opérons.
- `genos-eval/src/qtl.rs` — corréler les rangs Hox avec les traits phénotypiques mesurés.

## 4. Cas d'usage
- Garantir qu'un agent « auditeur » n'acquiert jamais des capacités d'action avant ses capacités de vérification.
- Breeding : les croisements respectent l'ordre colinéaire, évitant des chimères incohérentes (bras qui poussent sur la tête).

## 5. Apports attendus
- Plans d'organisation reproductibles et prévisibles entre générations d'agents.
- Réduction des agents « malformés » produits par recombinaison arbitraire.
- Vocabulaire commun pour décrire l'architecture d'un agent (segmentation normalisée).

## 6. Points d'intégration
`genos-core/src/genome.rs` (index Hox sur les loci), `genos-runtime/src/evolution/breeding.rs` (contraintes de croisement), doc gabarit `docs/3-features-and-domain/biomimicry/hox.md`.
