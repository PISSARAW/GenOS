# 0110 — Catalogue central des variants morphologiques

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Morphogenèse, topologies, variants
- **Décideurs** : GenOS
- **Lié à** : [ADR 0076](0076-runtime-morphogenese-v2.md), [ADR 0101](0101-prevol-shadow-et-commit-cas-morphogenese-v2.md)

## Contexte

Le registre Morphogenèse des topologies ne contenait que le variant `default`, tandis
que plusieurs runtimes possèdent déjà leurs propres catalogues de politiques. Cette
dispersion empêchait le registre central de décrire l'espace phénotypique réel et
risquait de confondre inventaire et capacité d'exécution uniforme.

## Décision

- Le registre central projette les identifiants et paramètres des catalogues locaux
  A-Team, Biocénose, Holobionte, Syncytium, Rhizome et Métapopulation.
- Chaque projection conserve son chemin source, ses capacités requises lorsqu'elles
  sont déclarées, et une maturité (`implemented` ou `partial`). Les politiques partielles
  restent consultables mais ne sont pas déclarées prêtes à la sélection automatique.
- Le contrat de topologie expose la liste des variants enregistrés et l'API de résolution
  renvoie une copie défensive des paramètres.
- L'inventaire central ne prétend pas unifier l'exécution des politiques locales. Leur
  sélection par Morphogenèse et leur compilation vers les runtimes restent des étapes
  distinctes.

## Conséquences

### Positives

- Le planner et les outils d'inspection peuvent découvrir les variants réels à partir
  d'un seul registre, avec provenance.
- La maturité partielle est visible et ne se transforme pas implicitement en garantie
  d'exécution.
- Les données centrales restent alignées sur les sources locales plutôt que copiées à
  la main.

### Négatives

- Certains paramètres locaux restent spécifiques à leur runtime et ne sont pas
  interprétables uniformément par le planner.
- L'ajout d'une source locale au catalogue crée un couplage de dépendance explicite qui
  doit être maintenu avec cette source.

## Alternatives

- Copier tous les variants en données statiques dans le registre central : rejeté, car
  cela créerait une seconde source de vérité.
- Déclarer toutes les politiques comme pleinement exécutables : rejeté, car plusieurs
  définitions locales indiquent explicitement un niveau partiel ou ne sont pas encore
  reliées à une sélection Morphogenèse commune.
