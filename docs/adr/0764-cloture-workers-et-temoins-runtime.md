# ADR 0764 — Clôture des workers et témoins du runtime

- **Statut** : Accepté
- **Date** : 2026-10-31
- **Domaine** : Workers, preuves, exécution et reprise
- **Décideurs** : Maintenance GenOS
- **Lié à** : ADR 0763

## Contexte

Les six défauts de l'audit worker concernent l'authenticité des preuves,
la validation prématurée, la clôture malgré un test échoué et la publication
d'une reprise avant son écriture durable. Les correctifs initiaux doivent
conserver la séparation entre une déclaration du modèle et un témoin de l'hôte.

## Décision

- Le parent atteste les tests à partir de ses événements de commande ou des
  reçus de suite liés au worker et à la mission. Un champ `passed` ou un
  `executionReceipt` fourni dans une réponse ne suffit pas. Les témoins du
  runtime remplacent la provenance déclarée avant validation de l'artefact.
- Le digest d'un test doit correspondre exactement au témoin. Une référence
  de vérification lie le contenu et le contrat vérifiés ; un hash attendu ou
  simplement lu n'établit pas une correction.
- Avant exécution, seules des demandes de tests autorisés peuvent différer
  le contrôle des preuves. Les autres exigences d'artefact restent actives.
- Le runtime contrôle les résultats des commandes et l'artefact final avant
  d'enregistrer une mémoire de succès. Un échec ou un refus produit une sortie
  non nulle. Le parent refuse aussi un rapport contenant un test échoué.
- Les demandes de reprise sont sérialisées par worker. La reprise devient
  visible en mémoire et dédupliquée après son écriture durable. Une erreur
  SQLite permet donc de retenter cette écriture. Le remplacement des reprises
  est transactionnel : une insertion échouée ne supprime pas la reprise précédente.
  La libération d'un dispatch attend les écritures en cours avant de réveiller
  une reprise, sans contourner l'annulation du parent.

## Conséquences

Les régressions couvrent les six scénarios initiaux, les reçus falsifiés,
les sorties de processus, les commandes refusées, la concurrence et la
réouverture de la base. Elles sont intégrées aux suites workers et qualité.
L'analyse lexicale distingue les clauses affirmatives des négations ; elle
reste une heuristique et ne remplace aucun oracle indépendant de promotion.

## Alternatives

Faire confiance aux booléens du modèle recréerait l'auto-attestation.
Nettoyer les caches uniquement après une erreur laisserait une reprise
non persistée visible pendant l'écriture. Ces deux solutions sont rejetées.
