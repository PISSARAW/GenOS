# Catalogue des variants morphologiques

- **Statut** : Partiel
- **Portée** : inventaire central des variants Morphogenèse provenant des registres locaux
- **Dernière revue** : 2026-09-25

Le registre Morphogenèse expose un catalogue commun de variants, tout en conservant les
registres locaux comme sources de vérité pour leurs politiques. Ce catalogue permet
l'inspection et la résolution par couple topologie/variant. Il ne signifie pas que le
planner sélectionne déjà ces variants ou que leurs runtimes partagent une exécution
uniforme.

## Couverture actuelle

| Topologie | Variants spécifiques au registre central | Source projetée | Maturité déclarée |
| --- | ---: | --- | --- |
| A-Team | 11 | `aTeam/variants/variantRegistry` | Implémentés |
| Biocénose | 12 | `biocenose/variants/variantPolicyRouter` | Implémentés ou partiels selon la politique |
| Holobionte | 12 | `holobionte/variants` | Partiels; douze politiques sélectionnables et projetées dans le contrat de composition |
| Syncytium | 13 | `syncytium/variants/variantPolicyRegistry` | Implémentés |
| Rhizome | 12 | `rhizome/variants/variantPolicyService` | Implémentés |
| Métapopulation | 16 (12 documentés + 4 alias historiques) | `metapopulation/policy/metapopulationPolicyService` | Partiels; sélection, quorum, migration et topologie des corridors |
| Biome | 11 | `biome/variants/variantPolicyService` | Partiels; sélection et politiques reliées au runtime |
| Trinity | 12 | `trinityVariantService` | Implémentés ou partiels selon la variante |

Les nombres du tableau comptent les variants nommés spécifiques et excluent `default`,
enregistré séparément pour les huit topologies. Un variant catalogué n'implique pas que
toutes ses garanties ou tous ses mécanismes conceptuels disposent d'un adaptateur complet.

## Contrat et résolution

Chaque entrée centrale expose :

- `topology` et `variantId`, qui identifient sans ambiguïté le couple morphologique ;
- `parameters`, projetés du registre local ;
- `requiredCapabilities`, lorsque la source locale les déclare ;
- `maturity` (`implemented` ou `partial`) et `source`, pour rendre visibles le niveau de
  réalité et la provenance.

Le registre est accessible via `createTopologyRegistry()`. `registry.variants.list(topology)`
renvoie les identifiants connus, et `registry.variants.resolve(topology, variantId)` renvoie
une copie défensive de l'entrée. Un variant inconnu renvoie `null`.

## Limites actuelles

- La planification Morphogenèse compare encore les topologies; elle ne choisit pas encore
  systématiquement un variant par profil de problème.
- Les paramètres spécifiques restent interprétés par le runtime local correspondant.
- Holobionte expose désormais des contrats de placement, mémoire, compétition, outils et
  synchronisation pour les variants correspondants. Ce sont des exigences déclaratives de
  composition; elles ne prouvent pas à elles seules le placement distribué, l'exécution d'outils,
  la réplication, ni les mécanismes complets de fitness, d'acquisition ou de régénération.
- Les variants Biocénose marqués `PARTIAL` et les variants Holobionte sont exposés avec une
  maturité partielle; leur présence dans le catalogue ne les promeut pas au statut complet.
- Trinity choisit parmi les variantes avec adaptateur actif; Factorial, Recursive et Oracular
  sont marqués conceptuels et exclus de l'auto-sélection. Jury, Adaptive, Counterfactual et
  Heterogeneous restent partiels et signalent leurs limites dans le reçu.
- Métapopulation garde quatre noms historiques (`balanced`, `resilient`, `exploratory`,
  `conservative`) en plus des douze identifiants de sa fiche; la sélection règle le quorum,
  la migration, le scope persistant et le graphe de corridors, sans activer tous les mécanismes
  propres aux variants tels que l'évolution ou la cryptobiose.
- Le catalogue ne normalise pas encore pour tous les variants le profil de problème, les
  modèles d'autorité, d'état, de communication et de preuve, ni les forces et modes d'échec.

## Ajouter ou modifier un variant

1. Modifier le registre local qui porte la politique du variant.
2. Mettre à jour le projecteur correspondant dans `backend/src/services/morphogenesis/registry/variantCatalog.js`.
3. Ajouter un test du couple topologie/variant, des capacités et de la maturité projetées.
4. Ne brancher une sélection automatique qu'après définition de ses critères de compatibilité
   et de son adaptateur d'exécution.

Voir [ADR 0110](../../adr/0110-catalogue-central-des-variants-morphologiques.md) pour la décision
de centralisation et [Morphogenèse](morphogenese.md) pour le cadre général.
