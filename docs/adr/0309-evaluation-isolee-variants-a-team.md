# ADR 0309 — Évaluation isolée des variantes A-Team

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : A-Team, contrats de variante, preuve, dispatch
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0115, ADR 0171, ADR 0284

## Contexte

Les politiques A-Team exposent des contrôles de quorum, d'autorité, de transfert et
de staffing, mais le dispatch générique ne les exécute pas toutes. Un résultat de
transport ou une politique calculée ne démontre pas l'exécution des sous-équipes.

## Décision

Le module `variantExecutionRuntime.js` fournit une évaluation explicite des contrats
de variante. Il consigne étapes, décisions et éléments observés dans un résultat
local. Les sous-équipes `multiteam` sont marquées comme planifiées ; leur lancement
reste confié au runner de programme doté d'un adaptateur `executeTeam`.
Une proposition de contrat `boundary_spanner` renseigne `promotionBlocked`,
sans devenir une autorisation ou un refus de promotion à elle seule.

Ce runner n'est pas branché sur le dispatch A-Team générique. Son statut
`SUCCEEDED` atteste uniquement que l'évaluation demandée s'est achevée.
Les gates de preuve et de promotion existantes restent l'autorité pour les runs
réels. Les tests d'acceptation utilisent des fixtures locales et ne prétendent
pas démontrer l'exécution d'un worker.

## Conséquences

- Les onze variantes ont un contrat d'évaluation testable sans élargir l'autorité
  du dispatch.
- Un futur branchement doit fournir les identités, la persistance et les preuves
  des sous-runs avant d'annoncer une exécution réussie.
- Les sorties de planification ne peuvent pas être traitées comme des reçus
  d'exécution ou de promotion.

## Alternatives

- Déclarer les sous-équipes lancées dès la construction du plan : rejeté,
  car aucun worker n'a été exécuté à cette étape.
- Activer tous les contrôles au dispatch générique : reporté tant que les
  contrats d'adaptation et de preuve ne sont pas présents.

## Complément du 2026-10-06

[ADR 0329](0329-cloture-verifiable-runs-a-team.md) ajoute la clôture canonique commune au dispatch explicite et au parcours autonome, avec preuves et accusés versionnés. Cette décision ne branche pas l'évaluateur isolé au dispatch et ne transforme pas les plans multiteam en sous-runs exécutés. La distinction entre succès d'évaluation et promotion d'un TeamRun reste applicable. Voir [Référence du runtime A-Team](../03-reference/runtime-a-team.md).
