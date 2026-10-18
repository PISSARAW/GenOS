# ADR 0613 — Dossier de preuve falsifiable avant promotion

- Statut : accepté
- Date : 2026-10-18
- Portée : backend, état causal, promotion

## Contexte

L’autorité d’exécution v2 lie une exécution à son identité, son code, ses entrées,
ses budgets et ses baux. L’état causal versionné permet ensuite de rejouer un
chemin et de constater qu’il produit bien l’état annoncé. Ces garanties sont
nécessaires, mais elles ne démontrent pas que la conclusion produite est vraie.

Un transport réussi, une sortie techniquement valide ou un rejeu déterministe
peuvent donc accompagner une décision fausse. La promotion doit rester bloquée
tant que les affirmations décisives ne disposent pas de preuves indépendantes
et n’ont pas survécu à une tentative explicite de falsification.

## Décision

GenOS ajoute un dossier de preuve v1, persistant et lié à :

- un run sous autorité d’exécution v2 ;
- l’agent exact de ce run ;
- un reçu de rejeu causal vérifié ;
- une liste canonique d’affirmations falsifiables ;
- une politique bornant le quorum indépendant et les essais de falsification.

Les preuves et tentatives de falsification sont ajoutées à des journaux
append-only. Leur producteur, leur vérificateur, leur provenance et leur condensat
sont inclus dans un scellement canonique. Un vérificateur n’est indépendant que
s’il est distinct du producteur et de l’agent candidat. Une répétition par le même
vérificateur ne compte qu’une fois dans le quorum.

Le scellement du dossier émet exactement une disposition :

- `promote` : toutes les affirmations satisfont le quorum indépendant, le rejeu
  est vérifié et les tentatives obligatoires de falsification ont survécu ;
- `reject` : un contre-exemple vérifié ou une falsification concluante réfute une
  affirmation ;
- `quarantine` : l’intégrité ou la provenance d’un élément est incohérente ;
- `escalate` : le dossier est incomplet ou inconclusif.

Le reçu `promote` porte `authorizesPromotion: false`. Il ne remplace aucun garde
existant : il est consommé en plus de l’autorité épistémique, de l’AEIS, de
l’oracle natif, du modèle de soi et de la porte de promotion actuelle. Le contrat
active cette exigence par `promotion.require_evidence_dossier_v2: true`, et
l’appelant fournit l’identifiant scellé par `promotionDossierId`. À la consommation,
les affirmations du rapport de promotion signé doivent toutes être présentes dans
le dossier : un dossier prouvant une affirmation sans rapport ne peut pas servir
de substitut.

## Invariants

1. Un succès technique sans preuve indépendante produit `escalate`.
2. Un contre-exemple vérifié domine les preuves favorables et produit `reject`.
3. Une rupture d’intégrité produit `quarantine`, jamais une promotion dégradée.
4. Un dossier scellé, ses preuves et ses falsifications sont immuables.
5. Le changement d’autorité, de run ou d’agent ferme la porte.
6. Le dossier ne peut pas contourner la porte de promotion historique.
7. Le rejeu causal atteste une reproduction ; il n’est pas assimilé à la vérité.
8. Le dossier consommé couvre les affirmations du rapport soumis à l’approbation.

## Conséquences

La migration 136 introduit trois tables : dossiers, preuves et tentatives de
falsification. Le service de promotion vérifie le dossier seulement lorsque le
contrat l’exige, ce qui permet une activation progressive sans réinterpréter les
anciens contrats. Les quatre dispositions restent lisibles et auditables, et la
promotion réelle demeure réservée au journal transactionnel déjà en place.

Le coût assumé est une étape de collecte et de scellement supplémentaire. Une
preuve indépendante doit être matérialisée par une provenance vérifiable ; la
mémoire, l’auto-évaluation ou le simple statut de processus ne suffisent pas.

## Vérification

`backend/tests/test_promotion_evidence_dossier.js` couvre :

- l’escalade d’un succès technique sans preuves ;
- la promotion éligible avec quorum indépendant et falsification survivante ;
- le rejet par contre-exemple ;
- la quarantaine après altération de condensat ;
- le refus de l’auto-vérification, du mauvais acteur et du dossier absent ;
- l’immutabilité après scellement.
