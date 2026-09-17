# ADR 0018 — Gouvernance du registre philosophique

- Statut : Accepté
- Date : 2026-09-17
- Domaine : Philosophie, registre, relations, preuve
- Décideurs : Équipe GenOS
- Lié à : [taxonomie conscience/esprit/mental](../01-concepts/conscience-esprit-mental.md), [philosophie politique](0017-philosophie-politique-et-gouvernance.md)

## Contexte

Le registre philosophique rassemble des concepts, des relations et des mappings
vers GenOS. Sans séparation explicite, un concept documenté pourrait être
interprété comme une fonctionnalité, et une analogie comme une autorisation.

## Décision

Le registre est gouverné par quatre distinctions :

1. **concept** : position ou notion philosophique ;
2. **relation** : lien déclaré entre concepts ;
3. **mapping** : correspondance vers une structure GenOS ;
4. **service** : adaptateur éventuellement exécutable, avec maturité indépendante.

Les concepts et relations de référence restent déclaratifs et versionnés dans le
code et les schémas. Les relations runtime dynamiques restent dans leur persistance
dédiée. Toute exécution passe par le routeur et ses adaptateurs testés.

## Conséquences

### Positives

- provenance et niveau de preuve visibles ;
- compatibilité entre documentation, API et visualisation ;
- impossibilité de déduire une permission d'un simple mapping ;
- évolution progressive des adaptateurs.

### Négatives

- une entrée exige plus de métadonnées et de tests ;
- certaines relations resteront interprétatives ou disputées ;
- le registre ne tranche aucun débat philosophique.

## Règles de changement

Toute modification du contrat doit mettre à jour le schéma, le registre, les tests,
la documentation de référence et, si l'architecture change, un nouvel ADR.
