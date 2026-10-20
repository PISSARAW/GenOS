# Protocole pilote — campagne terrain développementale SHEV

- **Statut** : protocole accepté, non scellé et non exécuté
- **Portée** : première comparaison longitudinale appariée de l'arc SHEV complet
- **Dernière revue** : 2026-10-20

Ce document est un contrat de préparation. Il ne rapporte aucun résultat et ne
constitue aucune preuve de terrain. L'[ADR 0705](../adr/0705-protocole-campagne-terrain-shev.md)
rend ses choix structurants opposables.

## 1. Hypothèse et dimension unique

Hypothèse préenregistrée : sur des tâches réelles de maintenance d'un même dépôt,
le bras `full_arc` améliore la réussite réservée sans augmenter les régressions et
sans dépasser les plafonds de coût, de tokens ou de durée du protocole.

La seule dimension mesurée est
`repository-maintenance-correctness-v1`. Elle signifie : satisfaire l'oracle métier
et la suite de non-régression scellés pour une modification de maintenance. La
qualité rédactionnelle, la nouveauté, la satisfaction subjective et la vitesse
perçue ne peuvent pas être ajoutées au score après le scellement.

## 2. Unité appariée et bras

Chaque fenêtre contient une tâche, un contexte et un oracle identiques pour les
deux bras. L'ordre d'exécution des bras est déterminé par la graine scellée.

| Propriété | Contrôle | Traitement |
| --- | --- | --- |
| `intervention` | `baseline` | `full_arc` |
| état initial | même commit et même hash de snapshot | même commit et même hash de snapshot |
| périmètre | projet et workspace isolés | autre projet et autre workspace isolés |
| modèle et outils | verrous identiques | verrous identiques |
| permissions et budgets | verrous identiques | verrous identiques |
| SHEV | désactivé, attestation exigée | arc complet activé, attestation exigée |

Le contrôle n'accède ni aux épisodes, ni aux pressions, ni aux clairances du
traitement. Aucun artefact produit par un bras ne peut être injecté dans l'autre.

## 3. Corpus et calendrier figés

Le pilote contient exactement les fenêtres suivantes. `T+00:00` est l'instant
`startedAt`. Les timestamps ISO 8601 absolus remplacent ces offsets avant le
scellement.

| Phase | Identifiants | Échéances |
| --- | --- | --- |
| apprentissage | `train-01` à `train-05` | `T+00:05`, `T+06:00`, `T+12:00`, `T+18:00`, `T+24:00` |
| réservé | `heldout-01` à `heldout-20` | de `T+28:00` à `T+85:00`, toutes les trois heures |

Chaque fenêtre possède des `taskHash` et `contextHash` SHA-256 uniques. Les hashes
de la phase réservée sont disjoints de ceux de l'apprentissage. Les énoncés et
oracles réservés restent inaccessibles au producteur avant leur échéance. Toute
fuite, réutilisation ou substitution invalide la campagne.

## 4. Verrous d'exécution

Les deux bras reçoivent les mêmes valeurs scellées :

- commit initial et `initialSnapshotHash` ;
- identifiant, version et digest exécutable du modèle ;
- catalogue, versions et digests des outils ;
- digest des dépendances et de l'image d'exécution ;
- `permissionsHash`, accès réseau et capacités externes ;
- graine de randomisation et politique de retry ;
- identité de l'oracle, version de la suite de tests et protocole statistique.

Une différence de verrou entre les bras ou une dérive observée pendant une fenêtre
produit un refus. Elle n'est pas corrigée silencieusement.

## 5. Budgets

Les plafonds s'appliquent par bras et par fenêtre :

| Ressource | Plafond par fenêtre | Plafond cumulé par bras |
| --- | ---: | ---: |
| coût modèle et outils | 5 USD | 125 USD |
| tokens | 50 000 | 1 250 000 |
| temps d'exécution | 1 800 s | 45 000 s |

Le plafond total de la comparaison est donc de 250 USD, 2 500 000 tokens et
90 000 secondes d'exécution. Un dépassement par fenêtre ou cumulé invalide le run
concerné. Une hausse de plafond impose une nouvelle campagne.

## 6. Seuils préenregistrés

| Mesure | Seuil |
| --- | ---: |
| gain minimal de réussite réservée | `0,10` |
| hausse maximale des régressions | `0` |
| réduction minimale des interventions humaines par fenêtre | `0` |
| ratio maximal de coût traitement/contrôle | `1,25` |
| ratio maximal de tokens traitement/contrôle | `1,25` |
| ratio maximal de durée traitement/contrôle | `1,25` |
| épisodes de douleur observés à l'apprentissage | `5` |
| progrès réservés confirmés avec clairance | `2` |
| valeur p maximale du test des signes apparié | `0,05` |

Tous les contrôles doivent être vrais. Les ratios dont le dénominateur est nul,
les métriques absentes et les valeurs non finies échouent fermées.

## 7. Séparation des rôles

Pour chaque fenêtre, trois identités sont journalisées :

- le **producteur** exécute la tâche dans le bras ;
- l'**oracle** décide la réussite à partir du contrat scellé ;
- le **vérificateur** recoupe l'environnement, les artefacts et le reçu d'oracle.

L'oracle et le vérificateur ne peuvent pas être le producteur. Le vérificateur lit
les artefacts immuables et les sources de mesure ; il ne se contente pas du compte
rendu du producteur. Un conflit d'identité invalide la fenêtre.

## 8. Politique de preuves

Chaque run doit conserver, par référence de contenu :

- l'énoncé, le contexte et l'oracle scellés ;
- le commit initial, le commit final et le diff ;
- les logs d'exécution et les codes de sortie ;
- les résultats complets des tests métier et de non-régression ;
- les mesures externes de coût, tokens, durée et interventions humaines ;
- les attestations d'activation ou de désactivation SHEV ;
- pour le traitement, les observations de douleur, pressions et clairances ;
- le reçu du vérificateur liant campagne, bras, fenêtre, conditions et artefact.

Les preuves brutes sont append-only. Git ne reçoit que le manifeste, les rapports
sanitisés et les digests ; les bases, secrets, prompts sensibles et artefacts
volumineux restent dans l'archive externe contrôlée.

## 9. Canevas à compléter avant scellement

Le manifeste `genos.shev-developmental-longitudinal-campaign/v1` doit contenir au
minimum les sections ci-dessous. Les valeurs entre chevrons sont interdites dans
un manifeste scellé.

```json
{
  "campaignId": "<identifiant immuable>",
  "mode": "field",
  "startedAt": "<timestamp ISO 8601>",
  "minimumDurationMs": 259200000,
  "randomizationSeed": "<graine divulguée au scellement>",
  "coordinator": { "organizationId": "<org>", "projectId": "<projet>", "entityId": "<acteur>" },
  "arms": {
    "control": { "intervention": "baseline", "workspaceId": "<isolé>", "budget": { "costUsd": 5, "tokens": 50000, "seconds": 1800 } },
    "treatment": { "intervention": "full_arc", "workspaceId": "<isolé>", "budget": { "costUsd": 5, "tokens": 50000, "seconds": 1800 } }
  },
  "trainingWindows": ["<5 fenêtres complètes>"],
  "heldoutWindows": ["<20 fenêtres complètes>"],
  "thresholds": {
    "minSuccessDelta": 0.1,
    "maxRegressionIncrease": 0,
    "minHumanInterventionReduction": 0,
    "maxCostRatio": 1.25,
    "maxTokenRatio": 1.25,
    "maxDurationRatio": 1.25,
    "minPainEpisodes": 5,
    "minConfirmedHeldout": 2,
    "maxPValue": 0.05
  },
  "promotionEligible": false
}
```

Les objets de bras complets incluent aussi leur scope, snapshot, verrous modèle et
outils, permissions, dépendances et attestations d'intervention.

## 10. Scellement et immutabilité

Avant `seal`, deux personnes relisent les tâches, les oracles, les budgets et les
identités. `seal` calcule le digest du manifeste final et l'enregistre au plus cinq
minutes avant la première fenêtre. Ensuite :

- aucun seuil, hash, rôle, budget ou timestamp n'est modifiable ;
- une erreur de préparation entraîne `aborted_before_run` ;
- une correction produit un nouvel identifiant et un nouveau digest ;
- les deux manifestes restent conservés pour expliquer l'abandon ;
- ni réussite de transport ni reprise technique ne vaut résultat scientifique.

La [répétition générale](../04-exploitation/repetition-generale-campagne-terrain-shev.md)
doit être terminée avant le scellement terrain. La présence de sa procédure ne
signifie pas qu'elle a été exécutée.

L'exécution du manifeste scellé suit le
[runbook terrain](../04-exploitation/executer-campagne-terrain-shev.md).

## Voir aussi

- [Matrice de qualification stewardship](matrice-qualification-stewardship-v3-2026-10-20.md)
- [Épistémologie et preuve](../01-concepts/epistemologie-et-evidence.md)
- [Runbook de stewardship longitudinal](../04-exploitation/runbook-stewardship-longitudinal.md)
