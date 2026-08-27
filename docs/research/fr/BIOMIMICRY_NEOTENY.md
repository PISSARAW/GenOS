> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Néoténie : Conservation Délibérée de la Plasticité Juvénile

> Domaine : biologie évolutive (néoténie, hétérochronie) — Statut : proposition de recherche

## 1. Fondement biologique
L'axolotl reste larvaire toute sa vie tout en se reproduisant : la néoténie conserve des traits juvéniles à l'âge adulte. Chez l'humain, le crâne fœtal reste souple et les périodes critiques s'étendent — cette prolongation de la plasticité est considérée comme un moteur de notre capacité d'apprentissage. Les espèces néoténiques échangent spécialisation contre adaptabilité continue.

## 2. Formalisation GenOS
```
Néoténie(C) = politique hétérochronique : retarder délibérément la « fermeture » de certaines capacités
  Traits conservés juvéniles : budget jeu protégé, taux de mutation épigénétique élevé,
                               absence de procéduralisation forcée (pas de réflexes figés prématurément)
  Contrepartie : performance brute inférieure aux agents spécialisés du même âg généalogique
Usage populationnel : réserver une fraction φ_neo de chaque flotte en agents néoténiques
                       (explorateurs permanents, testeurs de migration, canaris)
```

## 3. Mapping primitives existantes
- Budget jeu (`play.md`) — trait juvénile par excellence.
- Procéduralisation cérébelleuse (`cerebellum.md`) — ce que la néoténie retarde volontairement.
- Épigénétique (`epigenetics.rs`) — maintien de la plasticité via marqueurs ouverts.

## 4. Cas d'usage
- Chaque flotte garde 10 % d'agents néoténiques qui absorbent les migrations de stack sans reformation coûteuse.
- Test A/B long-terme : les néoténiques évaluent les nouvelles pratiques sans biais de procédures anciennes.

## 5. Apports attendus
- Maintien institutionnalisé de l'adaptabilité dans des populations matures (anti-rigidité).
- Trade-off explicite et pilotable spécialisation/plasticité au niveau démographique.
- Réponse structurée à l'obsolescence des compétences (les néoténiques survivent aux changements).

## 6. Points d'intégration
Politique `neotenic` dans `AgentGenome`, quota démographique dans `ecosystem.rs`.
