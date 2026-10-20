# ADR 0687 — Évaluer l'évolution du scaffold par une double causalité

- **Statut** : Accepté, preuve locale synthétique
- **Date** : 2026-10-19
- **Domaine** : DGM, évolution de scaffold, causalité, responsabilité projet
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0338, ADR 0002, épistémologie et preuves

## Contexte

Le comparateur DGM/GVX existant vérifie des budgets et contrats identiques, mais
ne décrit pas le cycle interne d'une modification du scaffold. Une amélioration
sur un benchmark agent peut aussi déplacer le travail, les erreurs ou les zones
sans propriétaire vers le projet. Elle ne suffit donc pas à justifier une
promotion. Inversement, perdre les candidats refusés masque l'espace exploré et
favorise la répétition d'échecs.

## Décision

GenOS ajoute un protocole de lignée de scaffold dans
`integrations/dgm_comparison/` :

- chaque racine et candidat est identifié par son digest et son parent ;
- chaque candidat fournit snapshot, capsule isolée, auteur, patch et chemins
  modifiés ; les chemins d'autorité restent immuables ;
- succès, échecs et références de preuve sont des événements append-only chaînés
  par hash ;
- auteur, évaluateur, runner parent et runner candidat sont des identités
  distinctes ;
- benchmark et holdout sont non vides, disjoints et comparés par cas, seed et
  contrat identiques ;
- chaque partition exige simultanément un gain agent et un gain de responsabilité
  projet, sans paire régressive ;
- l'évaluation produit seulement un dossier scellé éligible à revue. Le champ de
  décision de promotion reste nul.

Le score de responsabilité est fourni par l'adaptateur métier. Il doit représenter
un effet projet mesurable, par exemple la réduction des responsabilités orphelines
ou des échecs de handoff, et non une auto-évaluation du candidat.

## Conséquences

### Positives

- les modifications restent reliées au scaffold parent et à leurs échecs ;
- la mutation ne peut pas modifier son propre évaluateur ou gate ;
- le holdout et la responsabilité projet empêchent une optimisation limitée au
  score agent visible ;
- une évaluation favorable ne se transforme pas en auto-promotion.

### Négatives et limites

- le runtime vérifie les reçus fournis, pas la réalité physique des capsules ;
- les tests sont synthétiques et ne démontrent aucune supériorité sur DGM ;
- un SHA-256 chaîné détecte une altération, mais ne remplace pas une signature ;
- les seuils et la sémantique du score de responsabilité doivent être qualifiés
  pour chaque domaine ;
- le test causal apparié local n'établit pas à lui seul une généralisation
  statistique.

## Alternatives

- **Promouvoir sur le seul benchmark agent** : rejeté, car l'effet projet reste
  inconnu.
- **Autoriser l'auto-évaluation du scaffold** : rejeté, car le candidat pourrait
  assouplir sa propre mesure.
- **Ne conserver que le meilleur candidat** : rejeté, car les échecs et leur
  provenance sont nécessaires à l'apprentissage et à l'audit.
