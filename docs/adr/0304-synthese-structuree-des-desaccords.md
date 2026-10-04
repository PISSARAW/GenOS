# ADR 0304 — Synthèse structurée des désaccords

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, synthèse, provenance
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0303

## Contexte

Le `synthesis_worker` avait un contrat de provenance, mais aucune voie
déterministe capable de conserver des positions contradictoires dans
un artefact de synthèse vérifiable.

## Décision

La méthode `synthesize_claims` prend de deux à cent positions structurées,
chacune avec une référence source unique, une proposition et une position.
Elle regroupe uniquement les propositions textuellement identiques.
Quand les positions diffèrent, le dossier conserve toutes les positions
et leurs références. Un reçu relie les données fournies au dossier produit.
Cette route ne consomme aucun token de modèle.

## Conséquences

Un cas de désaccord devient mesurable par recalcul indépendant. Cette
méthode ne vérifie ni la vérité des sources ni l'équivalence sémantique
de formulations différentes. Le dossier décrit exactement la structure
des entrées, sans prétendre résoudre le désaccord.

## Alternatives

- Choisir arbitrairement une position majoritaire : rejeté, car cela
  effacerait une contradiction et sa provenance.
- Déduire des équivalences sémantiques par modèle tout en annonçant un
  calcul déterministe : rejeté, car cette inférence ne serait pas prouvée.
