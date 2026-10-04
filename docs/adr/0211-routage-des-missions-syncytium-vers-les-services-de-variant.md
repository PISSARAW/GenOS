# ADR 0211 — Routage des missions Syncytium vers les services de variant

- **Date** : 2026-10-04
- **Statut** : accepté

## Contexte

Le sélecteur de politique sait nommer treize variants, mais une session créée par
le schéma générique ne fournit pas nécessairement les champs et domaines requis
par les opérations du service spécialisé. Une campagne pourrait alors sélectionner
`hard` sans initialiser `hard.leases`, ou `speculative` sans son journal de validation.

## Décision

Les campagnes de missions demandent explicitement `useVariantRuntime: true`.
Dans ce mode, la politique choisit le constructeur du service spécialisé et lui
transmet la configuration, la base, la sélection et les métadonnées de politique.
L'API historique de création de session conserve sa route générique hors campagne.

Une opération spécialisée doit passer par une interface autorisée qui lie
l'identité de l'appelant à l'acteur et au domaine de la session. Les mutations
génériques ne constituent pas une preuve de réussite d'un protocole spécialisé.
Le verdict de campagne exige en outre un oracle indépendant des déclarations des
workers.

## Conséquences

Les manifestes Hard, Hierarchical et Human–AI doivent fournir les membres,
régions ou noyaux exigés par leurs constructeurs. Une configuration absente échoue
avant le dispatch. Les métadonnées de politique restent persistées même lorsque
le constructeur du variant fournit son propre schéma.
