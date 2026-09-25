# ADR 0102 — Boucle de migration régionale vérifiée

## Statut

Accepté.

## Date

2026-09-25

## Domaine

Métapopulation, sélection de propagules, corridors et runtime régional.

## Lié à

ADR 0047 — Sessions persistantes de Métapopulation ; ADR 0093 — Contrôleur régional autonome de Métapopulation.

## Contexte

Le cerveau régional diagnostiquait les besoins et les stratégies sélectionnaient des candidats, mais la décision, l'offre en quarantaine, la validation du receveur et la vérification du résultat n'étaient pas réunies dans un cycle régional.

## Décision

1. N'orchestrer une migration qu'avec l'activation explicite du demandeur et un trigger adaptatif positif.
2. Évaluer les candidats selon la politique demandée et exiger une utilité nette positive ; un rescue explicitement critique est l'exception prévue par le service d'utilité.
3. Ne proposer qu'un propagule par cycle, uniquement sur un corridor dirigé actif de capacité positive.
4. Vérifier qu'un adaptateur receveur est enregistré, puis lui déléguer validation et assimilation sans contourner la quarantaine.
5. Vérifier en persistance l'issue terminale `ACCEPTED` ou `REJECTED` avant d'enregistrer le cycle comme réussi.
6. En cas d'erreur d'adaptateur, conserver la migration en quarantaine avec sa clé idempotente pour permettre une reprise sûre.
7. Pour un rescue d'un dème à capacité unique protégé, exiger de l'adaptateur des mesures de fitness avant/après et un rollback. En cas de régression, annuler l'assimilation, appliquer la pénalité du corridor, vérifier la fitness restaurée et persister l'issue avec son reçu.

## Conséquences

### Positives

- La boucle relie trigger, sélection, utilité, corridor, quarantaine, décision du receveur et preuve d'issue.
- Les tests couvrent l'acceptation avec reçu, le rejet, l'absence d'offre sans trigger, le blocage d'une migration défavorable et le rollback d'un rescue qui régresse.
- Le débit demeure borné à un propagule par cycle et la capacité du corridor reste appliquée par la persistance.

### Négatives

- L'appelant fournit encore les signaux, candidats et contexte local du receveur.
- Une erreur de revue laisse un élément en quarantaine qui demande une reprise explicite.
- Les rescues exigent un adaptateur de mesure et d'annulation ; sans lui, l'action est bloquée.

## Alternatives

- Assimiler le propagule avant validation du receveur : rejeté, car le dème cible conserve son autorité.
- Migrer plusieurs candidats par cycle : rejeté pour garder les effets et leur vérification bornés.
- Traiter un trigger absent comme autorisation : rejeté, car l'absence de signal ne doit pas déclencher un flux régional.
