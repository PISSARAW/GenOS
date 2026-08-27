> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Transition Multicellulaire : Agrégation Élastique en Super-Organisme

> Domaine : biologie évolutive (Dictyostelium, origine de la multicellularité) — Statut : proposition de recherche

## 1. Fondement biologique
La dictyostélium (moisissure slime) vit libre en amibes quand la nourriture abonde ; en cas de famine, des dizaines de milliers d'amibes **s'agrègent** par chimiotaxie en un limace qui se déplace comme un seul organisme, puis forme une fructification différenciée (tige/spores). La transition unicellulaire → multicellulaire est donc réversible et pilotée par l'environnement — le super-organisme émerge sans fusion génétique, par adhésion et spécialisation.

## 2. Formalisation GenOS
```
Agregation({C_1..C_n}, déclencheur D) :
  D ∈ {famine de budget, tâche indivisible, deadline critique, quorum volontaire}
  SuperOrganisme SO = {corps: agents exécutants coordonnés (gap junctions + endocrine),
                       tête: agent coordinateur élu (différenciation), identité propre: snapshot SO scellé}
  Propriétés : les C_i gardent leurs génomes individuels ; SO a un budget commun et une trajectoire unique ;
               dissolution programmée à l'objectif atteint ou au rétablissement des ressources
  Différence avec huddle existant : le huddle est un vote ponctuel ; SO est une entité persistante à cycle de vie complet
```

## 3. Mapping primitives existantes
- Quorum sensing / chimiotaxie (`organization/network.rs`) — signal d'agrégation.
- Huddles (`genos-runtime/src/huddle.rs`) — brique de coordination à étendre en entité persistante.
- Stigmergie/endocrine — canaux internes du corps.

## 4. Cas d'usage
- Mission trop grosse pour tout agent isolé : n agents s'agrègent en super-agent avec budget mutualisé, puis se dissolvent en récupérant leur autonomie (et les artefacts communs archivés).
- Mode survie : famine de tokens → agrégation pour concentrer les ressources restantes sur une seule entité viable.

## 5. Apports attendus
- Élasticité structurelle : flotte plate ⇄ organisme hiérarchique selon les besoins, sans reconfiguration manuelle.
- Réutilisation directe d'un mécanisme évolutif éprouvé deux fois dans l'histoire de la vie.
- Budget mutualisé et responsabilité unifiée pour les tâches indivisibles.

## 6. Points d'intégration
`genos-runtime/src/superorganism.rs` (nouveau), extension `huddle.rs`, outil MCP `biomimicry_aggregate`.
