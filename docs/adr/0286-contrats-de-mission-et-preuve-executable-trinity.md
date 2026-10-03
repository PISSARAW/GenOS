# ADR 0286 — Contrats de mission et preuves exécutables Trinity

## Statut

Acceptée.

## Date

2026-10-03.

## Domaine

Trinity, vérification indépendante, contrats de sortie.

## Décideurs

Équipe GenOS.

## Lié à

ADR 0281, 0282, 0283 et 0285.

## Contexte

La campagne Trinity réelle a montré des dossiers vides ou méta, des sorties sans
structure exploitable, et des rejets adversariaux sans contre-exemple. Pour le
problème des 12 pièces, une procédure 4-4-4 séduisante était rejetée à juste titre,
mais aucun composant n'énumérait les 24 cas pour prouver son défaut. Les prompts
Pareto et les axes métier ne suffisaient pas à produire des mesures comparables.

## Décision

Chaque domaine connu reçoit un contrat de sortie qui demande des hypothèses, mesures
et preuves adaptées à la mission. Les affirmations non mesurées restent
conditionnelles. Pour le puzzle des 12 pièces, un vérificateur déterministe simule
les trois pesées de chacune des 24 possibilités et génère un reçu indépendant
uniquement si la feuille atteinte identifie la bonne pièce et son orientation.

La vérification est ajoutée après le nettoyage des sorties du modèle. Elle peut
étayer la couverture du puzzle; elle ne transforme pas les autres affirmations du
rapport en faits vérifiés. Une sortie absente ou incorrecte reste une incertitude et
ne passe pas la barrière de fusion.

## Conséquences

### Positives

- Les workers reçoivent un schéma d'artefact concret et des critères discriminants.
- Le rejet d'une stratégie incorrecte peut s'appuyer sur un contre-exemple calculé.
- Les preuves déterministes sont séparées des revendications du modèle.

### Négatives

- Les missions non reconnues gardent un contrat générique, moins fort.
- Le vérificateur de puzzle est spécifique au format `weighingTree` et au cas
  classique de 12 pièces, trois pesées.

## Alternatives

- Continuer à demander une réponse libre et laisser la comparaison interpréter le
  texte : rejeté, car les dossiers peuvent être vides ou non comparables.
- Traiter le verdict du red worker comme preuve suffisante : rejeté, car le round 2
  montre qu'un rejet correct peut ne fournir aucun contre-exemple.
