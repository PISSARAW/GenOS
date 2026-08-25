# Biomimétisme & Endosymbiose : Intégration d'Organites Externes

> Domaine : biologie évolutive (théorie endosymbiotique, Margulis) — Statut : proposition de recherche

## 1. Fondement biologique
Les mitochondries et chloroplastes étaient des bactéries libres : englouties puis intégrées, elles sont devenues des organites permanents et indispensables, avec leur propre ADN hérité maternellement. L'endosymbiose transforme un outil externe en composant interne irréversible mais essentiel — une intégration *plus profonde* qu'une dépendance, moins intime qu'un gène natif.

## 2. Formalisation GenOS
```
Endosymbiose(hôte C, outil externe O) :
  Phases : (1) commensalisme — O utilisé de l'extérieur ; (2) mutualisme contractuel — SLA bilatéral ;
           (3) endosymbiose — O intégré au génome comme « organelle » avec son propre sous-génome (config propre,
               versionnée séparément, héritée par tous les descendants de C)
  Garde-fou : l'intégration est explicite, signée, et son historique complet est conservé (on sait toujours que la
              mitochondrie fut une bactérie) ; test de réversibilité périodique (peut-on encore vivre sans O ?)
```

## 3. Mapping primitives existantes
- HGT/plasmides (`genos-core/src/hgt.rs`) — le transfert ponctuel existe ; l'endosymbiose en est la forme permanente.
- Mutualisme contractuel (`mutualism.rs`) — stade intermédiaire du pipeline.
- Génome (`genome.rs`) — ajout d'une section `organelles` distincte des chromosomes.

## 4. Cas d'usage
- Un moteur vectoriel externe devenu indispensable à un agent RAG : intégration endosymbiotique avec sous-config versionnée.
- Historique de dépendances : chaque agent sait quelles capacités sont natives, plasmidiques ou endosymbiotiques.

## 5. Apports attendus
- Vocabulaire précis pour les degrés d'intégration des outils externes (aujourd'hui tout se vaut).
- Gestion explicite du lock-in : l'endosymbiose documentée rend visible ce qui serait sinon une dépendance cachée.
- Hérédité propre aux organites (comme l'ADN mitochondrial maternel) : traçabilité fine des lignées d'outils.

## 6. Points d'intégration
Section `organelles` dans `AgentGenome`, extension du pipeline hgt→mutualisme→endosymbiose.
