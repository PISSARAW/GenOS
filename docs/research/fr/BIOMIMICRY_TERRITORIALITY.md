# Biomimétisme & Territorialité : Zones de Responsabilité Exclusives

> Domaine : éthologie (territorialité, marquage olfactif) — Statut : proposition de recherche

## 1. Fondement biologique
Beaucoup d'animaux défendent un territoire dont ils connaissent parfaitement les ressources, marqué par des signaux (olfactifs, sonores) qui évitent le combat direct : la **convention** remplace l'affrontement. Le territorialisme optimise le rapport coût/bénéfice : défendre un domaine connu est moins cher que rivaliser en permanence. Les tailles de territoire suivent des lois économiques (coût marginal de défense vs bénéfice marginal de ressources).

## 2. Formalisation GenOS
```
Territoire(A) = {domaine de tâches D_A, bornes déclarées, TTL}
Marquage : enregistrement public signé dans le registre stigmergique (analogie olfactive) — pas un verrou bas niveau mais une convention haute valeur
Effet : les autres agents évitent D_A par défaut (économie de travail dupliqué et de conflits de merge)
Économie : taille_max(D_A) = f(capacité réelle de A) — sur-marquage sanctionné (perte de crédibilité de signal)
Renégociation : TTL courts par défaut ; contestation possible via preuve (meilleure fitness mesurée sur D_A pendant fenêtre d'observation)
```

## 3. Mapping primitives existantes
- Stigmergie (`swarm.rs`) — support naturel du marquage.
- Verrous sémantiques au niveau merge gating — le territoire prévient les conflits en amont.
- Réputation (altruisme réciproque) — sanction du sur-marquage.

## 4. Cas d'usage
- Un agent « owner » du module auth : tous les forks touchant ce domaine lui sont automatiquement adressés.
- Partitionnement spontané d'un gros chantier entre agents sans orchestrateur central.

## 5. Apports attendus
- Moins de conflits de fusion (prévention en amont vs résolution aval).
- Parallélisme propre sans coordinateur central.
- Économie : zéro double-travail sur les domaines marqués.

## 6. Points d'intégration
Extension stigmergique (`pheromone type=territory`), politique de contestation dans `ecosystem.rs`.
