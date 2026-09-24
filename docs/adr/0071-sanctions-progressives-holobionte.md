# Sanctions progressives des symbiontes Holobionte — identifiant historique 0071

- **Statut** : Remplacé — voir ADR 0073
- **Date** : 2026-09-24
- **Domaine** : Holobionte, gouvernance, contrats, immunité
- **Décideurs** : GenOS
- **Lié à** : ADR 0060, ADR 0061, ADR 0066

## Contexte

Un symbionte résident peut dégrader la sûreté ou ne plus respecter son contrat. Le
Host doit pouvoir répondre de façon graduée, avec une justification traçable et des
conditions explicites de retour à un état normal. Une sanction ne doit pas permettre
d'élargir les permissions contractuelles.

## Décision

Le service de sanctions accepte les actions `WARN`, `THROTTLE`, `REDUCE_CONTEXT`,
`REDUCE_RESOURCES`, `REVOKE_TOOL`, `REVOKE_NETWORK`, `RESTRICT_SCOPE`,
`QUARANTINE`, `DORMANT` et `EXPEL`. Toute sanction exige une raison, des références
de preuve, une durée et des conditions de récupération.

Les décisions passent par l'autorité constitutionnelle du Host et la revue AEIS.
Elles sont consignées dans la mémoire de réputation du partenaire. Les changements
de permissions réutilisent l'adaptation contractuelle, qui interdit l'escalade.
L'expulsion exige une approbation explicite du système ou de l'utilisateur et
révoque les ressources ainsi que le contrat actif.

## Conséquences

### Positives

- Les sanctions sont graduées, justifiées et auditables.
- Les réductions de permissions restent soumises aux invariants des contrats.
- Les actions irréversibles comme l'expulsion nécessitent une approbation explicite.

### Négatives

- Une sanction peut être rejetée si les preuves ne passent pas AEIS.
- Les actions affectant un contrat dépendent de la disponibilité du service de contrats.

## Alternatives

- Retirer immédiatement tout symbionte en faute : rejeté, car cela ne permet ni
  réponse proportionnée ni récupération contrôlée.
- Autoriser les sanctions sans preuve persistée : rejeté, car la décision ne serait
  pas auditable.
