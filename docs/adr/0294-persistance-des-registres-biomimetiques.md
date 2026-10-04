# ADR 0294 — Persistance des registres biomimétiques

- Statut : accepté
- Date : 2026-10-04
- Domaine : handlers MCP biomimétiques, état adaptatif, SQLite

## Contexte

Les handlers maintiennent des registres `Map` utilisés directement par leurs
fonctions. Le bootstrap ne réhydratait qu'une partie de ces registres. Son appel
depuis la base utilisait un chemin inexistant, et les handlers interprétaient
une `Promise` comme un persisteur synchrone. Un proxy de `Map` cassait aussi
les méthodes natives et les mutations.

## Décision

La base transmet sa connexion initialisée au bootstrap. Celui-ci réhydrate les
registres déclarés dans un catalogue explicite, en modifiant les `Map` déjà
référencées par les handlers. Le persisteur branche les mutations sur ces mêmes
objets et sérialise leurs écritures. Après un appel MCP qui utilise un registre,
le répartiteur enregistre aussi l'état complet afin de couvrir les modifications
directes des objets contenus dans la `Map`. Un échec de persistance empêche
l'appel de retourner un succès.

## Alternatives

- Remplacer les `Map` par des proxies : rejeté, car les références internes
  et les méthodes natives ne suivent pas de manière fiable le proxy.
- Persister tous les registres après chaque appel MCP : rejeté pour éviter
  des écritures SQLite sans rapport avec l'outil appelé.

## Conséquences

Le catalogue doit être mis à jour lorsqu'un nouveau handler ajoute un registre.
Le résultat MCP atteste la persistance de son registre, sans attester que
l'action biomimétique a produit un effet runtime externe. Les handlers qui
annoncent une simulation restent des simulations.
