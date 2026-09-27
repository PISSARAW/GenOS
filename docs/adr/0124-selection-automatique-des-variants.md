# 0124 — Sélection automatique et exécution des variants de topologie

- **Statut** : Proposé pour implémentation
- **Date** : 2026-09-25
- **Domaine** : Morphogenèse, orchestration, topologies
- **Lié à** : [ADR 0110](0110-catalogue-central-des-variants-morphologiques.md)

## Contexte

Le catalogue central recense des variants, mais le planificateur ne sélectionne que la
topologie. Plusieurs runtimes choisissent un variant par défaut, certains ne possèdent
pas de sélecteur, et les huit topologies n'exposent pas toutes un contrat d'exécution
commun. La documentation décrit aussi des variantes conceptuelles ou différées. Les
faire apparaître dans un catalogue ne les rend pas exécutables.

## Décision proposée

1. Conserver les registres locaux comme sources de vérité pour les paramètres et ajouter
   à chaque variant des métadonnées explicites d'adéquation à la tâche : signaux positifs,
   incompatibilités, exigences, niveau de maturité, adaptateur et critères de succès.
2. Profiler chaque mission en un contexte typé. Écarter d'abord les variants incompatibles
   ou non exécutables, puis classer les autres avec des règles explicables et déterministes.
   Le choix automatique retourne variant, score, motifs, alternatives et niveau de confiance.
3. Accepter un variant explicitement demandé, mais valider ses exigences et sa maturité.
   Une préférence explicite ne contourne jamais les contrats, les preuves, les leases ni
   les portes de promotion.
4. Transmettre le variant retenu à l'adaptateur propre à la topologie au dispatch et le
   persister dans le plan, la session et le reçu de mission. Chaque adaptateur doit
   appliquer des comportements observables propres au variant.
5. N'activer l'auto-sélection que pour les variants dont l'adaptateur et le critère
   d'acceptation sont implémentés. Les variants conceptuels et partiels restent visibles,
   mais sont exclus du choix par défaut jusqu'à preuve d'exécution.
6. En l'absence de signal discriminant, choisir le variant sûr et déclaré comme baseline,
   exposer cette incertitude et ne pas prétendre avoir trouvé un « variant parfait ».

## Plan de réalisation

Voir [plan d'implémentation des variants](../02-orchestration/topologies/plan-implementation-variants.md)
pour l'inventaire, les vagues d'intégration et les critères de fin.

## Conséquences

- Le choix est inspectable et reproductible; les appels existants peuvent conserver un
  variant explicite.
- Les topologies ont besoin d'adaptateurs et de mesures d'acceptation spécifiques. Un
  profil de score seul ne suffit pas pour déclarer une variante fonctionnelle.
- Une variante sans preuve de runtime ne peut pas être auto-sélectionnée comme si elle
  était opérationnelle.
- **Écart constaté le 2026-09-27 (reste Proposé pour implémentation, pas de bascule sans preuve)** : catalogues locaux présents (`backend/src/services/morphogenesis/registry/variantCatalog.js`, `variantRegistry.js`, `backend/src/services/morphogenesis/variants/variantResolver.js`, `variantSchema.js`, `registry/topologyProfileService.js` avec baseline sûre) et tests associés (`test_morphogenesis_variant_catalog.js`, `test_biome_variant_selection.js`, `test_metapopulation_variant_selection.js`, `test_ateam_variant_execution.js`), mais conformité aux points 1–2 de la Décision non auditée au contenu (métadonnées d'adéquation par variant, règles déterministes mission → `{variant, score, motifs, alternatives, confiance}`), point 4 non prouvé (adaptateurs observables par topologie au dispatch), et document `docs/02-orchestration/topologies/plan-implementation-variants.md` introuvable. Ticket code à ouvrir : sélecteur unifié + dispatch + baseline prouvés par test avant acceptation.

## Alternatives

- Sélectionner par mots-clés libres uniquement : rejeté comme mécanisme final, car il
  peut sélectionner une politique incompatible et ne prouve pas son exécution.
- Choisir le premier variant du registre : rejeté, car l'ordre n'exprime pas l'adéquation.
- Autoriser toutes les variantes conceptuelles : rejeté, car cela présenterait des
  capacités non implémentées comme exécutables.
