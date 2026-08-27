> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Mutualisme : Coopération Contractuelle entre Agents

> Domaine : écologie (symbiose mutualiste) — Statut : proposition de recherche

## 1. Fondement biologique
Le lichen est une symbiose obligatoire algue+champignon où chacun fournit ce que l'autre ne peut produire (carbones vs minéraux/protection). Les mycorhizes étendent ce modèle à l'écosystème. Le mutualisme se distingue du simple échange : il implique **coévolution** et spécialisation complémentaire, souvent scellée par des mécanismes de sanction contre les tricheurs.

## 2. Formalisation GenOS
```
Mutualisme(A, B) = contrat { A_fournit: {capacité, SLA}, B_fournit: {capacité, SLA},
                            sanction: pénalité mesurable si défaut, révision: condition }
Propriétés : gain_mutuel > 0 mesuré sur fenêtre glissante ; coévolution : breeding conjoint autorisé
Sanction : défaut répété → résiliation + enregistrement phylogénétique (réputation de lignée)
```

## 3. Mapping primitives existantes
- `genos-eval/src/ecosystem.rs` — la biocénose existe ; le parasitisme y est modélisé (`parasitism.rs`), le mutualisme est son miroir absent.
- `genos-runtime/src/huddle.rs` — cas particulier temporaire de mutualisme.
- Breeding conjoint (`evolution/breeding.rs`) — la coévolution mutuelle s'y exprime.

## 4. Cas d'usage
- Paire chercheur+vérifieur liée par contrat : le chercheur fournit des hypothèses, le vérifieur fournit des validations ; leurs génomes co-évoluent vers une complémentarité optimale.
- Agent « mitochondrie » : fournisseur d'énergie/outillage dédié à un agent principal.

## 5. Apports attendus
- Qualité supérieure aux agents isolés grâce à la spécialisation croisée.
- Réputation de lignée = signal honnête pour l'appareillage (complète le breeding).
- Équilibre écologique : le parasitisme existant a enfin son pendant constructif.

## 6. Points d'intégration
`genos-eval/src/mutualism.rs` (nouveau), extension contrats dans `ecosystem.rs`, outil MCP `biomimicry_mutualism_form`.
