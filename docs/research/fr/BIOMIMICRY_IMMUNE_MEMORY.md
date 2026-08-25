# Biomimétisme & Mémoire Immunitaire : Vaccination des Agents

> Domaine : immunologie (immunité adaptative) — Statut : proposition de recherche

## 1. Fondement biologique
Après une première rencontre avec un pathogène, les lymphocytes mémoire confèrent une immunité durable : la réponse secondaire est plus rapide, plus forte, plus spécifique. La vaccination exploite ce mécanisme avec un antigène **atténué** : exposition contrôlée sans maladie. Le système passe d'une défense naïve à une défense amorcée.

## 2. Formalisation GenOS
```
Vaccination(C, menace M) :
  1. Atténuation : générer M' = version affaiblie de M (adversaire à budget/virulence réduits, corpus d'injections tronqué)
  2. Exposition contrôlée dans un monde jetable (`genos-world` CoW)
  3. Sélection clonale : détecteurs ayant réagi → clonés et mutés (hypermutation somatique existante)
  4. Consolidation en cellules mémoire : détecteurs signés, persistants, rejouables
Réponse_secondaire(M) = détection < ε temps, précision > primaire
```

## 3. Mapping primitives existantes
- `genos-core/src/resilience/cyber_immune.rs` — les détecteurs existent ; la couche « mémoire » manque.
- Hypermutation (`docs/3-features-and-domain/resilience/hypermutation.md`) — moteur de maturation d'affinité.
- `genos-world` — le bac de vaccination isolé.
- `security_coevolution/` (Red Queen) — la vaccination fournit les adversaires atténués.

## 4. Cas d'usage
- Nouvelle technique de prompt injection publiée → campagne de vaccination nocturne de toute la flotte avant exposition réelle.
- Certification : un agent « vacciné » porte un titre vérifiable (historique d'expositions rejouable).

## 5. Apports attendus
- Immunisation **proactive** au lieu de la correction post-incident.
- Réduction des faux positifs (les détecteurs ont appris sur des exemples proches du réel).
- Bibliothèque de vaccins partagée entre organisations (comme les campagnes sanitaires).

## 6. Points d'intégration
Extension `cyber_immune.rs` (module `memory_cells.rs`), outil MCP `resilience_vaccinate`, doc gabarit `docs/3-features-and-domain/resilience/vaccination.md`.
