# ADR 0360 — Studio : cible unifiée et zones de livraison

- **Statut** : Accepté pour le contrat de cible ; implémentation incrémentale à venir.
- **Date** : 2026-10-07.
- **Domaine** : Studio, architecture produit, couverture et qualification.
- **Décideurs** : opérateur et agent de développement.
- **Lié à** : ADR 0348 Studio, ADR 0350 navigation, ADR 0352 composition.

## Contexte

La première matrice de parité couvre les capacités communes et dix axes GenOS,
mais ne rend pas explicites tous les domaines canoniques ni les exigences propres
à un outil Studio. Une liste de pages ou une rubrique Atlas ne garantit pas leur
couverture. Les parcours actuels restent une base qualifiée sur des portées données,
pas la réalisation complète du produit cible.

L'opérateur demande de réunir besoins concurrentiels, concepts/mécanismes GenOS
et qualité intrinsèque de Studio, puis de développer par zones jusqu'à une cible
cohérente. Il autorise l'étape A : fixer la cible et la committer.

## Décision

Adopter [STUDIO-TARGET-V1](../03-reference/studio-contrat-directeur.md), contrat
directeur d'un atelier unique pour concevoir, exécuter, comprendre, vérifier,
améliorer, publier et exploiter des systèmes agentiques.

- Onze espaces de navigation regroupent les usages, non l'origine des besoins.
- Les objets et contrats d'action partagés préviennent les moteurs et identités
  concurrents entre vues ; les contrôles restent au backend/runtime.
- Z00–Z20 fixent les responsabilités. Sécurité et qualification sont transversales
  dès la première tranche ; huit parcours guident les livraisons verticales.
- F01–F04, C01–C26, S01–S10 sont conservés et rattachés aux zones. Les 22 domaines
  GenOS et U01–U12 deviennent des obligations explicites à détailler.
- Chaque concept canonique a une fiche ; chaque mécanisme exercé a une destination
  opérationnelle. Une référence ne crée ni capacité, ni preuve, ni autorité.
- Le futur registre relie exigence, objet, parcours, destination, zone, contrat,
  test, preuve et commit. Aucun domaine agrégé ne vaut registre exhaustif terminé.
- Une cible est versionnée ; ses exclusions et changements nécessitent une décision
  explicite. Les benchmarks gèlent références, versions, éditions et scénarios.

La décision ne prescrit aucun framework, nouveau moteur ou remplacement global
des stores. Elle complète les ADR Studio existants sans relever leurs qualifications
ni annoncer que leurs limitations fonctionnelles ont été supprimées.

## Conséquences

### Positives

- Besoins usuels et spécifiques partagent les mêmes parcours et primitives.
- Les omissions de concepts et les capacités déclaratives restent visibles.
- Le découpage permet des points atomiques, un commit par point et des preuves liées.
- Le référentiel, la sécurité et la qualité ne sont pas repoussés en fin de projet.

### Négatives et limites

- Le registre détaillé et les contrats de chaque point restent à produire.
- L'audit de tous les rivaux, les mesures de parité et les seuils de charge ne sont
  pas réalisés par cet ADR. Une source marketing ne certifie aucun comportement.
- Certains domaines nécessiteront des évolutions runtime avant leur parcours Studio.
- Couverture documentaire, fonctionnement et validation scientifique restent distincts.

## Alternatives

- Trois produits séparés : rejeté, duplication d'objets, de droits et de parcours.
- Une page principale par concept : rejeté comme règle globale, navigation saturée ;
  fiches canoniques et inspecteurs spécialisés restent exigés.
- Terminer chaque zone isolément : rejeté, aucun parcours utilisable garanti.
- Déclarer le produit complet depuis des captures ou un nombre d'écrans : rejeté,
  absence de preuve des effets, refus, reprises et qualifications comparatives.

## Références

- [Programme de parité](../06-qualite-preuves/studio-parite-plan.md).
- [Parcours actuellement qualifiés](../03-reference/studio-parcours-et-acceptation.md).
- [Maturité produit GenOS](../03-reference/contrat-produit-et-completude.md).
- [Référentiel de concepts](../01-concepts/README.md).
