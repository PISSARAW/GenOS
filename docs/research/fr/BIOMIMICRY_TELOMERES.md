> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Télomères : Limite de Divisions Intégrée (Hayflick)

> Domaine : biologie du vieillissement (télomères, limite de Hayflick) — Statut : proposition de recherche

## 1. Fondement biologique
Chaque division cellulaire raccourcit les télomères ; après ~50 divisions (limite de Hayflick), la cellule entre en sénescence. Ce n'est pas un défaut : c'est un **garde-fou anti-cancer** qui borne l'expansion clonale et force le renouvellement via les cellules souches (télomérase active seulement là). La mortalité répliquative protège l'organisme contre la dérive accumulée des copies.

## 2. Formalisation GenOS
```
Télomère(C) = compteur de forks restants {n_max, décrémenté à chaque fork, partiellement restaurable
             uniquement par voie « souche » (re-validation complète depuis snapshot fossile + télomérase contrôlée humaine)}
Effets par seuil :
  n > θ_1 : rien
  θ_2 < n ≤ θ_1 : avertissement, breeding privilégié (transmettre à une lignée neuve)
  n ≤ θ_2 : fork refusé — la lignée doit passer par reproduction sexuée (breeding) ou re-certification souche
Justification : chaque fork copie l'état avec ses micro-dérives accumulées ; borner les copies force le brassage
```

## 3. Mapping primitives existantes
- Compteurs dans les métadonnées de capsule (`genos-store`).
- Breeding (`evolution/breeding.rs`) — la voie légitime de renouvellement.
- Fossiles/spores — points de re-certification « souche ».

## 4. Cas d'usage
- Empêcher qu'une lignée d'agents ne se fork indéfiniment en s'éloignant toujours plus du génome validé.
- Politique explicite : au bout de N forks, obligation de breeding (brassage) ou de re-certification.

## 5. Apports attendus
- Anti-dégénérescence structurelle des lignées (borne la dérive cumulée).
- Incitation économique naturelle aux mécanismes de qualité existants (breeding, validation).
- Paramètre simple et auditable pour gouverner la longévité des flottes.

## 6. Points d'intégration
Compteur télomérique dans `AgentGenome` metadata, gate supplémentaire sur `fork`.
