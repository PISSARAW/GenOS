# Biomimétisme & Système Endocrinien : Signalisation Diffuse Longue Durée

> Domaine : endocrinologie — Statut : proposition de recherche

## 1. Fondement biologique
Le système endocrinien diffuse des hormones dans tout l'organisme via la circulation : signal **global, lent, durable**, à effet modulateur (cortisol = stress prolongé, adrénaline = urgence, hormone de croissance = développement). Il se distingue du signal nerveux (rapide, ciblé, bref) et complète la signalisation par phéromones (courte durée).

## 2. Formalisation GenOS
```
Hormone h = { type: Urgence|StressChronique|Croissance|Repos,
              concentration: f64 ∈ [0,1], demi_vie: Duration, seuil_effet }
Glande_endocrine = émetteur privilégié (orchestrateur, huddle)
Effet(h) = modulation multiplicative des politiques de TOUTES les capsules exposées au flux
C(t) décroît exponentiellement ; rétrocontrôle négatif par mesure d'effet.
```

Différence clé avec les phéromones (`swarm.rs`) : portée globale sans diffusion topologique, persistance longue, effet sur les politiques plutôt que sur la navigation.

## 3. Mapping primitives existantes
- `genos-core/src/organization/swarm.rs::SharedState` — extension : canal hormonal global distinct des phéromones locales.
- `genos-core/src/genome.rs` (drives) — les hormones modulent l'*expression* des drives, jamais leur valeur génétique (invariant épigénétique respecté).
- `genos-synaptic/src/ampk.rs` — le mode AMPK peut être biaisé par le fond hormonal.

## 4. Cas d'usage
- Mode « urgence » : incident production → toutes les capsules passent en prudence maximale pendant 30 min sans reconfiguration individuelle.
- Mode « croissance » : phase de breeding → budget exploration augmenté flotte entière.
- Cortisol chronique : détecter une flotte sous pression permanente (dette opérationnelle) et alerter.

## 5. Apports attendus
- Coordination lente et durable complémentaire aux mécanismes rapides existants.
- Une seule décision d'orchestration se propage à toute la flotte (économie de messages).
- Historique hormonal = télémétrie physiologique de la flotte (détection de stress systémique).

## 6. Points d'intégration
`genos-core/src/organization/endocrine.rs` (nouveau), outil MCP `biomimicry_inject_hormone`, doc gabarit `docs/3-features-and-domain/biomimicry/endocrine.md`.
