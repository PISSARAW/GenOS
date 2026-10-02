# ADR 0274 — Adaptateurs J-space pour modèles inspectables

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : AGOW, interprétabilité, modèles locaux, causalité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0269, ADR 0271

## Contexte

Les modèles hébergés ne donnent généralement pas accès aux activations internes.
Une interface uniforme ne doit pas masquer cette limite ni traiter un probe qui
décode une représentation comme une preuve d'influence sur le comportement.

## Décision

Les adaptateurs internes exigent des capacités déclarées et effectives
`internalActivations` et `activationIntervention`. Les extractions produisent un
vecteur numérique, un identifiant de probe, une plage de couches, une méthode et des
références de preuve. Un candidat J-space reste une hypothèse inférée.

Une intervention ne mesure son statut causal qu'avec une intervention effectivement
appliquée, des changements comportementaux mesurés, des contrôles répétés et des
preuves. Toutes les sorties gardent la promotion désactivée en attendant une revue
indépendante.

## Conséquences

### Positives

- Les hôtes opaques échouent explicitement au lieu d'émettre de faux résultats J-space.
- Les extractions et interventions partagent un contrat audit-able avec AGOW.

### Limites

- Aucun modèle instrumenté ni worker d'interprétabilité n'est inclus dans cette
  étape; un adaptateur local doit fournir les capacités et les reçus réels.
- Le statut causal local ne remplace ni la réplication réservée ni les tests sur
  d'autres modèles et tâches.

## Alternatives

- Inférer les activations depuis le texte d'une API : rejeté, car ce n'est pas une
  lecture interne du modèle.
- Qualifier le décodage seul de mécanisme causal : rejeté, car il n'établit pas un
  effet sur le comportement.
