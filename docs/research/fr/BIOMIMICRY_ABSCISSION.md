# Biomimétisme & Abscission : Perte Programmée et Propre des Modules

> Domaine : botanique (abscission foliaire) — Statut : proposition de recherche

## 1. Fondement biologique
L'arbre ne laisse pas tomber ses feuilles par négligence : il forme une **zone d'abcission** (couche de cellules qui scellent proprement la plaie), résorbe les nutriments de la feuille AVANT la chute (chlorophylle dégradée, azote récupéré), puis se scelle contre les pathogènes. La perte est programmée, anticipée, récupératrice — l'opposé d'une nécrose.

## 2. Formalisation GenOS
```
Absission(module m, motif saisonnier S) :
  1. Résorption : extraction préalable de tout ce qui vaut {artefacts → archivage, apprentissages → mutations candidates}
  2. Zone d'abscission : interface de séparation formelle (contrat de retrait : qui dépendait de m ? redirections temporaires)
  3. Chute : désactivation propre, scellement du point d'attache (référence morte explicite, pas de dangling)
  4. Cicatrisation : vérification qu'aucun chemin actif ne pointe vers m
Déclencheurs : saisonnalité (fin de mission), obsolescence programmée (TTL), économie de ressources (automne = pénurie)
```

## 3. Mapping primitives existantes
- Proteostase/ubiquitine (`proteostasis.md`) — pour la destruction ciblée ; l'abscission gère le **retrait d'interface** propre.
- Cleaner — exécution finale.
- Références Merkle — détection exhaustive des dépendances restantes.

## 4. Cas d'usage
- Fin de mission : retirer proprement les agents dédiés en récupérant leurs acquis avant désactivation.
- Décommissionner une fonctionnalité sans casser les consommateurs (redirections temporaires).

## 5. Apports attendus
- Simplification progressive et sûre du système (anti-entropie architecturale).
- Récupération systématique des valeurs avant toute suppression (rien n'est perdu par accident).
- Distinction nette : abscission (programmée, récupératrice) vs apoptose (urgence) vs protéolyse (nettoyage).

## 6. Points d'intégration
`genos-core/src/resilience/abscission.rs`, outil MCP `resilience_abscess_module`.
