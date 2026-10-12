# ADR 0436 — Contrôleur commun de décision en mode shadow

- **Statut** : Accepté pour le module de décision déterministe ; activation de production non qualifiée.
- **Date** : 2026-10-11.
- **Domaine** : Décision, preuve et économie de tokens.
- **Lié à** : [ADR 0383](0383-economie-tokens-conditionnee-aux-preuves.md), [ADR 0430](0430-devis-prudent-des-couts-d-action.md), [ADR 0420](0420-contrat-issue-mission.md).

## Contexte

Les devis couvrent les coûts d'exécution, de vérification et de reprise, mais
aucun choix commun ne confronte les actions à un objectif de mission et à une
probabilité calibrée de résultat vérifié. Le coût seul favorise indûment le
silence ; un simple taux de succès transport favorise indûment des appels
sans preuve.

## Décision

`missionActionDecisionService.decideMissionAction` évalue les alternatives
`none`, `abstain`, `procedure`, `tool`, `small_model`, `large_model`,
`delegation` et `verification`. Il valide le contrat de mission, les budgets
disponibles et les poids explicites de tokens, dollars et latence. Pour chaque
action active, il exige une obligation ouverte, une autorité vérifiée par un
adaptateur, des preuves prérequises vérifiées, un devis complet dont les
plafonds tiennent dans le budget, puis un reçu de calibration vérifié par un
adaptateur de confiance. Une probabilité seulement déclarée dans l'action
ne suffit pas.

Pour les alternatives admissibles, le score est la borne inférieure de la
probabilité de résultat vérifié divisée par `1 +` la somme pondérée des
coûts complets maximaux rapportés aux budgets disponibles. Les poids sont
explicites et totalisent un. Une égalité est départagée par le plafond de
tokens, puis l'identifiant. `none` ne devient admissible qu'après un verdict
`verified` validé ; `abstain` exige un verdict `abstained` validé. Chaque
résultat inclut toutes les alternatives, leurs motifs de rejet, le choix et
un enregistrement `journal` prêt à persister.

Le module retourne toujours `executable: false` et le statut `shadow` ou
`need_evidence`. Il ne transforme ni une fonction d'adaptateur fournie par
l'appelant ni une valeur de devis en autorisation d'exécution. Il ne modifie
pas les budgets. Sans adaptateur d'autorité ou de calibration, une action
active est rejetée.

## Intégration restante

Le parcours de mission devra fournir des adaptateurs de confiance pour
l'autorité, l'origine des preuves, la calibration hors échantillon et le
verdict du contrat ; persister le journal et le rattacher à la mission ;
réserver atomiquement le plafond avant exécution ; confronter les prédictions
aux résultats réels. Une campagne en mode shadow devra établir la calibration
et les effets sur le coût **par mission vérifiée** avant tout mode actif.
Cette intégration ne doit pas confondre le journal du sélecteur avec un reçu
épistémique ou une réservation.

## Vérification locale

`node backend/tests/test_mission_action_decision.js` couvre le choix à coût
complet, les quatre portes d'admissibilité, le refus d'une calibration non
validée, l'état terminal vérifié et les entrées invalides.
