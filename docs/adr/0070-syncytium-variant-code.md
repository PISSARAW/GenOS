# ADR 0070 — Variant Code pour Syncytium

## Statut

Accepté — lot 18 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, partage de code, cohérence sémantique.

## Décideurs

Équipe GenOS.

## Lié à

Phases 36 de la feuille de route Syncytium.

## Contexte

Le CRDT générique sait fusionner des valeurs, mais ne détecte pas qu'un changement de code retire un symbole ou modifie une signature encore importée par un autre fichier. Le variant Code doit conserver les fichiers dans l'état partagé et faire vérifier les changements par la barrière sémantique déjà traversée par les opérations Syncytium.

## Décision

1. Représenter les fichiers, résultats de tests et état du build dans des champs typés `MAP` et `LWW_REGISTER`.
2. Enregistrer avec chaque fichier son contenu, son empreinte SHA-256, un résumé AST lexical, ses exports détectés et ses imports relatifs.
3. Exécuter le détecteur de compatibilité de code dans le service commun de conflits sémantiques, avant application et promotion d'une branche.
4. Rejeter la suppression d'un symbole importé, le changement de signature d'une fonction importée et les imports non résolus.
5. Traiter l'inspection actuelle comme un analyseur lexical ciblé sur les déclarations `export` et imports nommés ECMAScript; un parseur AST complet reste une évolution distincte.

## Conséquences

### Positives

- Les métadonnées et résultats de vérification partagent le même historique causal que le code.
- Une incompatibilité connue est rejetée avant son commit dans l'état principal.
- Les préconditions d'empreinte empêchent l'écrasement silencieux d'une version lue plus tôt.

### Négatives

- L'analyseur lexical ne couvre pas toutes les syntaxes JavaScript, TypeScript ou CommonJS.
- Les tests et builds sont enregistrés comme résultats déclarés; ce variant ne lance pas les outils de construction.

## Alternatives

- Garder le code hors de Syncytium et transmettre uniquement des diffs textuels : écarté, car les dépendances et résultats perdraient leur provenance causale.
- Ajouter immédiatement un parseur AST multi-langage : reporté jusqu'à ce qu'un runtime parser commun et ses contrats soient définis.
