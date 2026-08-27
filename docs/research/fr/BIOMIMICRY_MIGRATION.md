> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Migration Animale : Navigation Planifiée entre Mondes

> Domaine : éthologie (migration, navigation) — Statut : proposition de recherche

## 1. Fondement biologique
La sterne arctique parcourt 70 000 km/an ; les tortues reviennent pondre sur leur plage natale. La migration animale combine plusieurs systèmes de navigation : boussole solaire/magnétique, carte cognitive mémorisée, suivi des aînés (culture migratoire). Points clés : le déplacement est **planifié et saisonnier** (pas une fuite), suit des corridors, et repose sur des points de repère redondants.

## 2. Formalisation GenOS
```
Migration(C, monde_source → monde_cible) :
  1. Carte : graphe des mondes avec attributs (niche, coût d'accès, fiabilité) maintenu collectivement
  2. Corridor : chemin validé {mondes intermédiaires ou transfert direct signé}
  3. Bagage : artefacts critiques embarqués (mémoire consolidée, credentials scellés)
  4. Transit : état « en vol » journalisé — ni exécution source ni cible avant arrivée confirmée
  5. Arrivée : re-vérification de niche (EcologicalNiche ∩ monde_cible ≠ ∅) sinon retour ou sporation
Suivi des aînés : un novice migre attaché à un migrant expérimenté (apprentissage social du trajet)
```

## 3. Mapping primitives existantes
- `genos-world` (isolation CoW) — topologie des destinations.
- Cryptobiose/spores — mode de transport à froid déjà opérationnel.
- `EcologicalNiche` (`genome.rs`) — validation d'arrivée.

## 4. Cas d'usage
- Déplacement saisonnier d'une flotte vers un environnement moins cher (provider régional) et retour.
- Évacuation planifiée d'un environnement dégradé (dépréciation d'API) sans interruption de mission.

## 5. Apports attendus
- Portabilité et continuité de mission inter-environnements, là où aujourd'hui seul le fork/snapshot existe (copie statique, pas navigation).
- Corridors auditable = sécurité des transferts (pas de migration sauvage hors périmètre).
- Mémoire collective des routes (carte partagée).

## 6. Points d'intégration
`genos-runtime/src/migration.rs`, extension de la carte des mondes dans `genos-world`.
