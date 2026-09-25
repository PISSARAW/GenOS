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
| Holobionte | 5 | `holobionte/variants` | Partiels |
| Syncytium | 12 | `syncytium/variants/variantPolicyRegistry` | Implémentés |
| Rhizome | 12 | `rhizome/variants/variantPolicyService` | Implémentés |
| Métapopulation | 4 | `metapopulation/policy/metapopulationPolicyService` | Implémentés |
| Trinity | Aucun; seul `default` | — | Baseline |
| Biome | Aucun; seul `default` | — | Baseline |

`default` est enregistré pour chacune des huit topologies. Les lignes Trinity et Biome
indiquent uniquement la couverture du catalogue Morphogenèse central; elles ne décrivent
pas l'ensemble de leurs configurations locales ou possibilités documentées.

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
- Les variants Biocénose marqués `PARTIAL` et les variants Holobionte sont exposés avec une
  maturité partielle; leur présence dans le catalogue ne les promeut pas au statut complet.
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
