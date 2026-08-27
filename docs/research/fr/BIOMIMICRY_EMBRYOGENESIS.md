> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Embryogenèse : Bootstrapping Progressif des Agents

> Domaine : biologie du développement (embryologie) — Statut : proposition de recherche

## 1. Fondement biologique
Un organisme multicellulaire ne démarre jamais « adulte » : il suit une embryogenèse en phases (clivage, blastulation, gastrulation, organogenèse) où les couches germinatives (ectoderme, mésoderme, endoderme) se différencient dans un ordre strict. Chaque phase prépare les conditions de la suivante ; une erreur précoce se propage à tout l'organisme.

## 2. Formalisation GenOS
L'initialisation d'un agent devient une séquence de phases vérifiables plutôt qu'un boot atomique :

```
Boot(C) = Phase0(Identité) → Phase1(Drives) → Phase2(Outils) → Phase3(Mémoire) → Phase4(Exposition monde)
Chaque Phase_i est scellée par un snapshot σ_i et validée par un prédicat P_i avant passage à i+1.
```

- **Blastula** : duplication interne du génome sans exposition au monde (validation de cohérence du génome).
- **Gastrulation** : affectation des couches → modules cognitifs (perception / décision / action), analogues aux trois feuilles germinatives.
- **Organogenèse** : instanciation paresseuse des opérons de compétences selon les besoins de la niche cible.

## 3. Mapping primitives existantes
- `genos-core::genome::AgentGenome` — le « zygote » computationnel.
- `genos-runtime/src/genome_os/` — cycle de vie génomique, point d'ancrage naturel des phases.
- Snapshots Merkle (`genos-store`) — scellement de chaque phase.
- Invariants `spec/GENOME_SPEC.md` — chaque phase respecte la séparation génotype/état.

## 4. Cas d'usage
- Boot d'un agent de production : erreurs de configuration détectées à la phase 2 (outils) avant tout appel LLM coûteux.
- Déploiement progressif d'une flotte : les agents n'accèdent au monde réel (`genos-world`) qu'en phase 4 validée.
- Reproduction : les descendants héritent d'un programme de développement, pas seulement d'un état final.

## 5. Apports attendus
- Réduction drastique des coûts d'amorçage (échec cheap en phase précoce vs échec cher en production).
- Traçabilité complète du développement : chaque σ_i est rejouable.
- Détection des « malformations » (génomes incohérents) avant exposition.

## 6. Points d'intégration
`genos-runtime/src/genome_os/` (machine à états de boot), `genos-protocol/src/specs/biomimicry.rs` (outil `biomimicry_embryo_phase_advance`), CLI `cmd_biomimicry.rs`.
