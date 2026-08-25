# Biomimétisme & Horloge de Développement : Âge Fonctionnel vs Âge Généalogique

> Domaine : biologie du développement (horloges développementales, allométrie) — Statut : proposition de recherche

## 1. Fondement biologique
Un organisme vieillit selon plusieurs horloges indépendantes : l'âge chronologique, la maturité sexuelle (développementale), l'usure (sénescence). Les horloges développementales pilotent des transitions obligatoires (sevrage, maturité) indépendamment du temps calendaire — un chien de 2 ans est adulte même si son espérance diffère d'un perroquet. L'allométrie lie taille et rythmes : les grands vivent plus lentement.

## 2. Formalisation GenOS
```
Trois âges distincts pour une capsule C :
  - âg généalogique : profondeur depuis l'ancêtre + temps écoulé (déjà mesuré via phylogénie/horloge moléculaire)
  - âg développemental : phase du programme embryonnaire complétée {embryon, juvénile, mature, spécialisé}
    = progression dans le programme Hox/boot, pas le temps
  - âg fonctionnel : usure accumulée = f(charge allostatique intégrée, dégradation phénotypique mesurée)
Règles pilotées par les âges :
  - pas de production avant maturité développementale (indépendante du temps)
  - maintenance accrue quand âg_fonctionnel >> âg_généalogique (vieillissement prématuré)
```

## 3. Mapping primitives existantes
- `phylogeny.rs` (horloge moléculaire) — âge généalogique existant.
- Boot embryonnaire/checkpoints — progression développementale mesurable.
- Allostasie (doc sœur) — composante de l'usure fonctionnelle.

## 4. Cas d'usage
- Un agent forké hier mais issu d'une longue lignée n'est pas « jeune » : ses droits et attentes dépendent de sa maturité développementale.
- Détection des agents prématurément usés (beaucoup de stress, peu de généalogie) pour maintenance ou retraite anticipée.

## 5. Apports attendus
- Découplage correct entre temps calendaire, maturité et usure — trois décisions différentes aujourd'hui confondues.
- Politiques de cycle de vie plus justes (droits liés à la maturité réelle).
- Base quantitative pour la sénescence (doc sœur).

## 6. Points d'intégration
Triple compteur dans les métadonnées de capsule (`genos-store`), extension `phylogeny.rs`.
