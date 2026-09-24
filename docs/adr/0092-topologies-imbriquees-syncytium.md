# ADR 0092 — Topologies Imbriquées dans Syncytium

## Statut

Accepté — lot 28 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, domaines nucléaires, topologies spécialisées et Shared State commun.

## Lié à

Phase 46 de la feuille de route Syncytium.

## Contexte

Une même mission peut utiliser une topologie spécialisée pour le code, une autre pour la vérification sécurité et une troisième pour un jugement d'architecture. Les participants doivent toujours écrire dans le Shared State Syncytium sous les mêmes règles de cohérence et d'autorité.

## Décision

1. Permettre d'imbriquer A-Team, Trinity et Biocenose sous un domaine parent.
2. Compiler les sous-domaines métier et leurs membres en domaines Syncytium hiérarchisés, en encodant leurs identifiants par parent, topologie et sous-domaine.
3. Déclarer les champs communs avec un domaine propriétaire Shared State et lister explicitement les droits de lecture et d'écriture des sous-domaines.
4. Exécuter opérations et transactions des participants via les APIs imbriquées, qui fixent le domaine avant les gates d'autorité et d'invariants.
5. Projeter les champs selon le sous-domaine et publier les capacités requises de chaque topologie imbriquée.

## Conséquences

### Positives

- Une mission combine des spécialistes A-Team, des rôles Trinity et des groupes Biocenose sans créer plusieurs états partagés.
- Les opérations restent soumises aux contrats causaux, conflits sémantiques et invariants Syncytium.
- Les règles d'accès permettent de partager explicitement les contrats entre topologies et de masquer les détails locaux.

### Négatives

- Les domaines sont statiques à la création de session; reconfiguration à chaud des groupes imbriqués n'est pas fournie.
- Les contrats d'accès doivent être décrits par chemins de champs, et les appels doivent porter le domaine feuille.

## Alternatives

- Lancer une session Syncytium séparée pour chaque sous-topologie : écarté, car les décisions et preuves ne convergeraient pas dans un Shared State commun.
- Donner à tous les participants l'accès global à tous les champs : écarté, car la réplication sélective doit rester configurable.
