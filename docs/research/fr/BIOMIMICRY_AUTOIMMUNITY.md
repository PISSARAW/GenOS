# Biomimétisme & Auto-immunité : Méta-surveillance des Défenses

> Domaine : immunologie (tolérance centrale/périphérique) — Statut : proposition de recherche

## 1. Fondement biologique
Un système immunitaire peut attaquer le « soi » : c'est l'auto-immunité. La prévention biologique repose sur la sélection négative thymique (élimination des lymphocytes auto-réactifs) et l'anergie périphérique. L'allergie est l'analogue fonctionnel : réponse disproportionnée à une menace inoffensive. Ces pathologies sont aussi informatives que les infections : elles révèlent un calibrage défaillant.

## 2. Formalisation GenOS
```
Autoimmunité(système) = taux d'interventions défensives contre composants sains
Mesure : chaque action défensive est rejouée a posteriori ; verdict {justifiée | faux positif | excessive}
Sélection négative : détecteurs ayant produit k faux positifs → retirés ou mutés (analogie thymus)
Anergie : détecteurs activés sans confirmation répétée → seuil relevé progressivement
Métrique système : AutoImmunité ∈ [0,1], alarme au-delà du percentile historique + σ
```

## 3. Mapping primitives existantes
- `cyber_immune.rs` (détecteurs, autotomie/honeypots) — objets de la méta-surveillance.
- Replay causal — vérification a posteriori de chaque intervention.
- `genos-eval/src/qtl.rs` — corréler gènes des politiques de sécurité avec taux de faux positifs.

## 4. Cas d'usage
- Une règle de sécurité trop zélée bloque 40 % des merges légitimes : détection automatique, mise en anergie, alerte.
- Audit périodique « thymique » : simulation de trafic sain pour purger les détecteurs auto-réactifs.

## 5. Apports attendus
- Le système de sécurité devient lui-même supervisé et améliorable par données.
- Réduction du coût caché des faux positifs (blocages légitimes, tokens perdus).
- Confiance accrue : chaque blocage est justifiable par replay.

## 6. Points d'usage / intégration
Extension `cyber_immune.rs` (module `self_tolerance.rs`), outil MCP `resilience_autoimmune_audit`, doc gabarit `docs/3-features-and-domain/resilience/autoimmunity.md`.
