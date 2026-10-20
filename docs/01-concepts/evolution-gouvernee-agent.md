# Évolution gouvernée des logiques agentiques

- **Statut** : Partiel — noyau déterministe implémenté, ledger en mémoire et applicateur externe
- **Portée** : hypothèses de logique/scaffold, constitution, holdout, autorisation, rollback
- **Dernière revue** : 2026-10-20

## 1. Définition

L’évolution gouvernée transforme une proposition de changement du comportement
agentique en hypothèse falsifiable. Elle ne réécrit jamais directement le runtime et
ne transforme pas un test vert en autorisation de promotion.

## 2. Modèle logique

Une hypothèse relie une révision parente, une révision candidate, des opérations
déclarées et un snapshot de rollback. Son état suit :

```text
HYPOTHESIS → QUALIFIED | REJECTED
QUALIFIED → AUTHORIZED_PENDING_APPLY
* → ROLLED_BACK
∅ qualifié → NO_CHANGE
```

Toutes ces sorties portent `promotionEligible: false`.

## 3. Biomimétisme et limites

La constitution joue le rôle d’un patrimoine protégé ; les candidats forment des
lignées et les rejets deviennent une mémoire négative. L’analogie s’arrête là : le
SHA-256, les identités d’acteurs et les reçus sont des contrôles logiciels, pas une
preuve biologique.

## 4. Objectifs métier

- explorer une nouvelle logique de planification sans lui déléguer sa promotion ;
- comparer un scaffold au parent sur des cas non vus ;
- préférer `NO_CHANGE` à une amélioration seulement cosmétique ;
- retrouver la révision saine et la cause d’un rollback.

## 5. Exemple

Un producteur propose un scaffold qui augmente un score interne de 0,5 à 0,9. Si
le taux de succès sur les responsabilités holdout reste à 0,6, le contrôle
`realResponsibilityBenefit` échoue et la décision est `NO_CHANGE`. Le rejet et ses
preuves restent dans `failureArchive` et dans le ledger du processus.

## 6. Flux

```text
Producteur ──hypothèse──> Constitution scellée
                              │
Runner externe ──holdout──────┤
                              v
Évaluateur indépendant ──> REVIEW_REQUIRED | NO_CHANGE
                              │
                              v
Autorisateur distinct ──> AUTHORIZED_PENDING_APPLY
                              │
                        applicateur externe
                              │
                              v
                    observation ou rollback reçu
```

## 7. Architecture technique

| Fichier | Responsabilité |
| --- | --- |
| `constitution.js` | canonicalisation, hash et chemins protégés |
| `hypothesisService.js` | hypothèse déterministe, lignée et rollback |
| `evaluationService.js` | indépendance, holdout, transfert réel et abstention |
| `ledger.js` | séparation des rôles, échecs, autorisation et reçu de rollback |

Le noyau n’appelle ni Git, ni shell, ni déployeur. L’intégrateur doit raccorder ces
sorties aux services de snapshots, preuves et promotion existants.

## 8. Contrats et invariants

### Constitution scellée

La constitution est canonicalisée puis liée à un digest. Elle déclare les chemins
protégés et les invariants que le candidat n'a pas le droit de redéfinir. Deux contrôles
sont distincts : l'intégrité du document constitutionnel et l'absence d'opération sur
un chemin protégé. Une hypothèse qui échoue l'un ou l'autre n'entre pas en évaluation.

### Hypothèse

Une hypothèse porte l'identité du producteur, les révisions parent/candidate, les
opérations déclarées et le snapshot de rollback. Le service ne déduit aucune mutation
depuis un diff non déclaré et fixe `promotionEligible: false` dès la création.

### Qualification

L'évaluateur reçoit des observations parent/candidat déjà produites. Il vérifie la
disjonction train/holdout, le gain sur holdout, le transfert réel et les garde-fous de
régression. La meilleure hypothèse peut perdre face à `NO_CHANGE` : un classement ne
crée pas une obligation de sélectionner.

### Autorisation et application

L'autorisateur doit être distinct des acteurs précédents et approuve une décision
liée à son digest. Le statut `AUTHORIZED_PENDING_APPLY` signifie exactement que la
revue est terminée et que l'applicateur externe peut commencer ; il ne signifie ni
que le patch a été appliqué, ni qu'il a produit un effet.

## 9. Observabilité

Le dossier minimal doit exposer :

- digests de constitution, hypothèse et décision ;
- lignée parent/candidate ;
- chemins touchés et opérations déclarées ;
- identités producteur, évaluateur et autorisateur ;
- résultats train, holdout, OOD et responsabilité réelle ;
- raison du choix ou de `NO_CHANGE` ;
- révision et preuve du rollback si déclenché.

## 10. Validation

Les tests ciblés vérifient : altération constitutionnelle refusée, chemin protégé
refusé, fuite train/holdout détectée, gain proxy insuffisant, preuve de responsabilité
obligatoire, autorisateur indépendant, révision de rollback exacte et `NO_CHANGE`.

```powershell
node backend/tests/test_governed_evolution_hypothesis.js
node backend/tests/test_governed_evolution_evaluation.js
node backend/tests/test_governed_evolution_ledger.js
```

## 11. Comparaison fonctionnelle

Une auto-réécriture monolithique privilégie la vitesse de boucle. Cette tranche
GenOS privilégie la responsabilité : le producteur ne choisit ni son verdict ni son
autorisation, le holdout doit être disjoint et le bénéfice doit atteindre une tâche
réelle attestée. Aucun résultat comparatif externe n’est toutefois encore mesuré.

La [Darwin Gödel Machine](https://arxiv.org/abs/2505.22954) démontre l'intérêt d'une
archive ouverte de descendants évalués empiriquement. GenOS reprend la lignée et la
mémoire des échecs, mais remplace l'autorité implicite du benchmark par une
constitution, un holdout, une responsabilité réelle et un applicateur séparé. Il ne
dispose pas encore d'un résultat expérimental comparable.

## 12. Limites et non-objectifs

- pas d’application automatique du patch ;
- pas de persistance inter-processus du ledger `GovernedEvolutionLedger` ;
- pas de signature asymétrique de la constitution ;
- pas de création automatique des holdouts ou des reçus ;
- pas de revendication de sûreté générale ni de supériorité empirique.

Voir [ADR 0685](../adr/0685-evolution-gouvernee-des-scaffolds.md),
[Évolution contrefactuelle gouvernée](../02-orchestration/evolution-contrefactuelle-gouvernee.md)
et la [matrice de qualification](../06-qualite-preuves/matrice-qualification-stewardship-v3-2026-10-20.md).
