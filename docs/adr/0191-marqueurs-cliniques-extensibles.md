# ADR 0191 — Marqueurs cliniques computationnels extensibles

- Statut : Accepté
- Date : 2026-09-30
- Domaine : Nosologie, modèle clinique, compatibilité des données

## Contexte

Les thérapies proposées par les rapports nosologiques ciblent des états qui ne sont pas présents dans le modèle `ClinicalState`. Ajouter des variantes de thérapie seules conduirait à des opérations sans cible explicite et risquerait de rapporter un succès fictif.

## Décision

`ClinicalState` porte une map sérialisée rétrocompatible de marqueurs computationnels normalisés. Chaque opérateur doit documenter sa clé canonique et n'agit que si la valeur existe, est finie et dans [0, 1]. L'absence ou l'invalidité de la cible n'entraîne aucune mutation ni rémission. Cette map n'est pas un modèle médical humain.

## Conséquences

- Les marqueurs peuvent être ajoutés sans étendre l'enum Pathology à chaque cible.
- Les clés sont contractuelles et doivent être documentées; une absence de cible n'est pas une guérison.
- Une migration de persistance n'est pas nécessaire grâce à `serde(default)`.
- Les opérateurs avec effets, préconditions ou interactions distincts gardent des clés et des vérifications séparées.
## Évolution documentée au 2026-10-06

Le contexte ci-dessus conserve les constats de la décision initiale. L’[ADR 0326](0326-catalogue-nosologique-et-preuve-application.md) précise désormais le catalogue des 28 conditions et 48 opérateurs, les statuts d’application, les gardes et la persistance autorisée avant mise à jour mémoire. Les signatures paramétrées et mécanismes biologiques détaillés des fiches restent proposés au-delà du [catalogue courant](../01-concepts/nosologie/catalogue-runtime.md). Les états Node et Rust conservent des contrats distincts. Le [bilan daté](../06-qualite-preuves/validation-nosologie.md) sépare les vérifications ciblées réussies des limites globales et du parcours HTTP → Rust non validé.
