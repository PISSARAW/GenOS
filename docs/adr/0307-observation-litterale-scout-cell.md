# ADR 0307 — Observation littérale du scout cell

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, observation, provenance
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0305

## Contexte

Le `scout_cell` disposait d'un contrat d'observation structuré, mais la
campagne comparative ne mesurait aucune observation exécutée par ce type.

## Décision

La méthode `scan_literal` accepte un petit corpus de textes explicitement
fourni avec références, et des termes littéraux. Elle cherche la première
occurrence de chaque terme par source, sans interprétation sémantique. Les
observations portent l'offset, la référence, la certitude du calcul littéral
et une incertitude sur le sens et l'authenticité. L'artefact n'est valide
que si au moins une occurrence est trouvée.

## Conséquences

Un cas d'observation devient reproductible et mesurable sans accès externe
ni token de modèle. Le reçu relie les textes fournis aux occurrences. Cette
route n'explore pas le Web, ne lit pas de fichiers et ne vérifie pas la
fiabilité des sources.

## Alternatives

- Présenter un texte fourni comme une observation du monde réel : rejeté,
  faute de collecte et de vérification indépendantes.
- Autoriser des expressions régulières arbitraires : rejeté pour garder
  un calcul borné et sans risque d'exécution excessive.
