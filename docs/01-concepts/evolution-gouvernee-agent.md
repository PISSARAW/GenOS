# Évolution gouvernée des logiques agentiques

- **Statut** : Partiel — noyau déterministe implémenté, persistence et applicateur absents
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

## 8. Validation

Les tests ciblés vérifient : altération constitutionnelle refusée, chemin protégé
refusé, fuite train/holdout détectée, gain proxy insuffisant, preuve de responsabilité
obligatoire, autorisateur indépendant, révision de rollback exacte et `NO_CHANGE`.

## 9. Comparaison fonctionnelle

Une auto-réécriture monolithique privilégie la vitesse de boucle. Cette tranche
GenOS privilégie la responsabilité : le producteur ne choisit ni son verdict ni son
autorisation, le holdout doit être disjoint et le bénéfice doit atteindre une tâche
réelle attestée. Aucun résultat comparatif externe n’est toutefois encore mesuré.

## 10. Limites et non-objectifs

- pas d’application automatique du patch ;
- pas de persistence inter-processus du ledger ;
- pas de signature asymétrique de la constitution ;
- pas de création automatique des holdouts ou des reçus ;
- pas de revendication de sûreté générale ni de supériorité empirique.

Voir [ADR 0685]($20685-evolution-gouvernee-des-scaffolds.md).
