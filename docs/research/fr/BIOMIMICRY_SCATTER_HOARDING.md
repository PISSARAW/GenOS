> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Cache Dispersé : Mémoire Écologique des Artefacts

> Domaine : éthologie (mise en cache, mémoire spatiale) — Statut : proposition de recherche

## 1. Fondement biologique
Le geai de Californie cache ~5000 graines par saison en centaines de sites dispersés et retrouve une fraction remarquable grâce à la **mémoire spatiale hippocampique** (points de repère géométriques). La dispersion (scatter hoarding) contre la prédation : aucun site ne concentre trop de valeur. Le larder hoarding (cache central) est l'alternative — plus efficace mais vulnérable. Les deux stratégies coexistent selon le régime de prédation.

## 2. Formalisation GenOS
```
ScatterCache(C) :
  Stratégie de persistance intermédiaire entre CAS central (larder) et rien :
    artefacts semi-critiques répartis sur N sites hétérogènes {fossiles locaux, spores régionales, mondes voisins}
    carte mentale = index spatial signé (analogie hippocampe), avec repères multiples par entrée
Rappel : multi-indices {contenu (CAS déjà), position, contexte temporel} — tolérant aux pertes d'index
Politique anti-prédation : valeur_max_par_site plafonnée ; re-dispersion périodique
```

## 3. Mapping primitives existantes
- `genos-store` CAS Merkle — le « garde-manger » central ; le scatter cache le complète pour la résilience.
- Cryptobiose/spores — sites de cache à froid.
- Réseau mycorhizien (`organization/network.rs`) — transport de dissémination.

## 4. Cas d'usage
- Artefacts de mission répartis sur plusieurs régions de stockage : survit à la perte d'une région entière.
- Reprise de mission après incident : rappel multi-indices même si l'index principal est corrompu.

## 5. Apports attendus
- Résilience de persistance sans coût de réplication totale du CAS.
- Modèle formel de compromis efficacité (larder) vs robustesse (scatter) paramétrable par menace.
- Réutilisation directe de la littérature cognitive (mémoire spatiale) pour concevoir l'index.

## 6. Points d'intégration
`genos-store/src/scatter.rs`, politique de dispersion dans les budgets de persistance.
