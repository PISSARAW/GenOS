# Qualification AEIS — 2026-10-20

- **Type** : preuve / qualification
- **Révision testée** : `98eefcf7`
- **Environnement observé** : Windows, Node.js `v24.18.0`
- **Décision** : suite AEIS canonique qualifiée ; qualification étendue des oracles
  natifs partielle
- **Dernière revue** : 2026-10-20

## 1. Objet

Cette campagne vérifie les propriétés exécutables de l'Adaptive Epistemic Immune
System. Elle ne cherche pas à valider empiriquement les poids de pression, l'indice
de diversité ou l'indépendance réelle des modèles.

## 2. Périmètre

### Inclus

- binding claim / `FormalResult` / reçu ;
- sandbox et exécutions réelles ;
- timeouts inconclusifs ;
- assemblages, rotation et rétention ;
- quorum provider et processus séparés ;
- mémoire, autorité et dissonance ;
- homéostasie, niches et budgets ;
- gate `approveRun()` ;
- benchmark local AEIS-EAB ;
- sondes ciblées d'oracle natif : complétion, coûts, code et mémoire.

### Exclus

- comptes provider externes réels ;
- corpus LoCoMo officiel et ses 446 questions ;
- calibration faux positifs / faux négatifs des heuristiques ;
- preuve causale d'indépendance entre fournisseurs ou modèles ;
- certification de sécurité du processus enfant ;
- qualification globale JavaScript, Rust ou produit.

## 3. Protocole

### 3.1 Suite canonique

```powershell
npm --prefix backend run test:aeis
```

Le premier essai dans le bac à sable a échoué sur
`test_aeis_provider_process_roundtrip.js` : les deux workers enfants ne pouvaient
pas joindre les serveurs HTTP locaux (`fetch failed (EACCES)`). La suite a été
relancée avec l'autorisation réseau locale nécessaire, sans modifier le code ni
les fixtures.

### 3.2 Qualification étendue des oracles

```powershell
node backend/tests/test_native_oracle_completion.js
node backend/tests/test_native_oracle_failure_costs.js
node backend/tests/test_native_code_completion.js
node backend/tests/test_native_memory_budget.js
node backend/tests/test_native_worker_oracle_checks.js
```

Le test code a dû être relancé hors du bac à sable pour créer le lien symbolique
temporaire utilisé par sa sonde de confinement.

## 4. Résultat de la suite canonique

```text
AEIS: 42 suites and benchmark completed successfully.
```

La suite complète s'est terminée avec le code `0`.

### 4.1 Propriétés observées

| Propriété | Résultat |
| --- | --- |
| claim exact accepté avec deux reçus | passé |
| faux claim `2+2=5` refusé | passé |
| claim sans rapport avec le test refusé | passé |
| rapport surdimensionné refusé avant spawn | passé |
| budget insuffisant refusé avant spawn | passé |
| commande dangereuse refusée par le sandbox | passé |
| timeout traité comme inconclusif | passé |
| rotation et rétention des assemblages | passé |
| providers distincts et quorum | passé |
| processus enfants et pannes isolées | passé |
| base provider en mémoire perdue à la fermeture | passé |
| review provider persistée par run et tenant | passé |
| nonces et replays concurrents | passé |
| `approveRun()` refuse preuve absente/altérée | passé |
| mémoire scoped refuse les issues non prouvées | passé |
| autorité persistante, quarantaine, apoptose | passé |
| clonal expansion et affinity maturation | passé |

## 5. Résultat AEIS-EAB local

| Mesure | Valeur observée |
| --- | ---: |
| cas | 4 |
| vrais acceptés | 1 |
| faux acceptés | 0 |
| vrais refusés | 3 |
| faux refusés | 0 |
| résultats de vérificateurs | 6 |
| latence totale | 412,50 ms |

Cas :

- `supported` : accepté ;
- `contradicted` : refusé par census, preuve et veto hôte ;
- `unrelated` : refusé avant vérificateur par le contrat de claim ;
- `unconfined` : refusé par census et veto hôte.

La latence est une observation locale non reproductible à l'identique. Quatre
fixtures ne permettent pas d'estimer un taux de faux positif ou de faux négatif.

## 6. Résultat des oracles natifs

### 6.1 Scénarios passés avant le blocage

| Scénario | Résultat observé |
| --- | --- |
| complétion native et référence scellée | passé |
| mutation, changement de propriétaire et replay | refusés |
| expiration et décision historique | comportement attendu |
| fidélité mémoire et source retirée | comportement attendu |
| réservation concurrente et retry | passé |
| budget insuffisant et quorum absent | refusés avant promotion |
| coûts incomplets après crash | conservés inconnus, replay refusé |
| code : 264 postconditions, deux processus | passé |
| faux succès code et couverture partielle signée | refusés |
| programme non supporté | inconclusif |
| traversée de chemin et symlink externe | refusés |
| mémoire : budget, nonces et approbation | passé |

### 6.2 Blocage de la matrice worker

`test_native_worker_oracle_checks.js` s'arrête à la ligne 34 :

```text
expected: verified
actual:   refuted
```

Ce défaut apparaît dans la matrice des artefacts workers structurés. Les tests
suivants du lot n'ont donc pas été exécutés dans cette commande :

- `test_worker_observation_oracles.js` ;
- `test_worker_structured_oracles.js` ;
- `test_model_oracle_route_e2e.js`.

La présente qualification ne déclare donc pas la matrice d'oracles native globale
verte. Le résultat doit être diagnostiqué séparément avant une telle revendication.

### 6.3 Avertissements d'environnement

Les scénarios natifs ont aussi émis des avertissements de télémétrie sur des
renommages de snapshots refusés par Windows (`EPERM`) et une fermeture SQLite
différée. Ils n'ont pas fait échouer les scénarios concernés, mais ils restent des
signaux d'exploitation à suivre.

## 7. Matrice revendication → preuve → confiance

| Revendication | Preuve de cette campagne | Confiance |
| --- | --- | --- |
| la suite AEIS canonique passe | commande complète, code `0`, 42 suites | élevée pour ce checkout et cet environnement |
| le claim doit correspondre au prédicat | fixtures `unrelated` et tests E2E | élevée |
| un timeout ne réfute pas | test dédié | élevée |
| les assemblages détectent le tamper | tests HMAC, rotation, relecture | élevée |
| le chemin provider fonctionne | round-trip local hors restriction réseau | élevée pour le protocole local |
| les providers sont épistémiquement indépendants | aucune preuve causale | non établie |
| la pression améliore l'efficacité | aucune campagne calibrée | non établie |
| la diversité prédit la justesse | aucune vérité terrain | non établie |
| tous les oracles workers sont qualifiés | test de matrice rouge | réfutée pour ce checkout |
| AEIS résout les claims sémantiques libres | aucun oracle général | non fournie par conception |

## 8. Falsifications importantes

### Deux processus ≠ deux sources indépendantes

Les tests démontrent des processus, workspaces ou providers distincts selon le
contrat. Ils ne démontrent pas l'absence d'entraînement, de données, de méthodes ou
d'erreurs communes.

### Réponse contrôlée ≠ vérité externe

Les fixtures provider qualifient transport, binding, délais et veto. Elles ne
mesurent pas la justesse de modèles externes réels.

### Test vert ≠ claim large

Le cas `unrelated` confirme que la réussite d'une commande n'étaye pas une
proposition voisine. Le prédicat doit être exact.

### Benchmark local ≠ LoCoMo

Les quatre fixtures AEIS-EAB ne sont pas le corpus LoCoMo. Aucun score LoCoMo ne
peut être annoncé sans corpus et prédictions correspondantes.

### Heuristique testable ≠ heuristique calibrée

Les tests de monotonie et de bornes vérifient le code. Ils ne valident pas les
poids `0.35/0.20/0.20/0.10/0.10/0.05`, les frontières
`0.25/0.50/0.70/0.90` ou un seuil d'efficacité.

## 9. Risques résiduels

1. matrice native worker rouge ;
2. dépendance des tests à des primitives OS parfois interdites ;
3. avertissements différés de snapshot et SQLite ;
4. absence de campagne multi-provider externe ;
5. absence de calibration empirique des politiques ;
6. couverture automatique limitée aux claims mécanisables ;
7. secret HMAC partagé : compromission et rotation relèvent de l'opérateur.

## 10. Critères du prochain niveau

Pour déclarer AEIS qualifié au niveau du runtime complet :

- corriger et repasser `test_native_worker_oracle_checks.js` ;
- exécuter les tests d'observation, de workers structurés et de route modèle ;
- repasser la suite sous les versions Node supportées en CI ;
- éliminer ou borner les avertissements de snapshot/fermeture ;
- exécuter la validation backend complète ;
- mener une campagne externe avec vérité terrain, providers réels et ablations ;
- publier sensibilité, spécificité, faux positifs, faux négatifs et coûts ;
- versionner toute politique calibrée séparément des valeurs d'ingénierie.

## 11. Décision de qualification

La suite AEIS canonique est **qualifiée pour les garanties procédurales couvertes
par ses 42 suites et ses quatre fixtures locales**. Le protocole de promotion,
les refus principaux, la persistance, le quorum exécutable et les limites de claim
sont observés sur ce checkout.

La qualification étendue des oracles natifs reste **partielle**. Elle ne doit pas
être présentée comme une validation de toute la matrice worker, comme une mesure
d'efficacité épistémique ou comme une création automatique de vérité.

## 12. Références

- [Runtime AEIS](../03-reference/runtime-aeis.md)
- [Runbook AEIS](../04-exploitation/aeis.md)
- [Adaptive Epistemic Immune System](../01-concepts/adaptive-epistemic-immune-system.md)
- [Immunité épistémique](immunite-epistemique.md)
- [ADR 0642](../adr/0642-borner-les-heuristiques-aeis.md)
