# Régulation par crédit externe — campagne des 19 workers natifs

- **Date** : 11 octobre 2026
- **Portée** : fournisseur contrôlé dans un processus et une base SQLite distincts ; supervision native sous contrats créés par la sonde
- **Résultat** : 38/38 reprises supervisées vérifiées par un auditeur indépendant
- **Limite** : la campagne ne prouve pas encore la planification et la clôture complètes par `genos_orchestrate`

## Protocole observé

La sonde `backend/tests/probes/test_external_credit_matrix.cjs` crée un compte externe de capacité 10 et de solde initial 2 par type. Pour chaque type, elle lance un vrai `recovery_worker` avec `replenish_external_quota`, observe un transfert de 5 depuis la réserve, puis lance le worker cible par son exécuteur natif. Au deuxième cycle, elle dépense 5 chez le fournisseur, ce qui remet le solde à 2, puis répète la recharge. Le `recovery_worker` cible possède lui-même un helper distinct. Avant la première recharge, un lancement de chaque cible hors plage est refusé.

L'auditeur `backend/tests/probes/audit_external_credit_matrix.cjs` ouvre ensuite les deux bases en lecture seule. Il vérifie chaque run, la correspondance helper/cible/mission/opération, le reçu Ed25519, la mesure Ed25519 présente dans `EVIDENCE_REPORT`, la mesure persistée par le superviseur et l'événement natif du worker cible. Le registre final satisfait `réserve 772 + soldes 133 + dépensé 95 = initial 1000`. Toute pièce manquante ou divergente fait échouer l'audit.

## Reproduction

Depuis la racine du dépôt sur D: :

```powershell
node backend/tests/probes/test_external_credit_matrix.cjs
node backend/tests/probes/audit_external_credit_matrix.cjs 'D:\GenOS-regulation-tests\regulation-probe-results\external-matrix-jRY1Wy'
```

Le premier programme imprime le nouveau dossier de résultat ; utilisez ce dossier comme argument du second. Les preuves de cette exécution sont dans `D:\GenOS-regulation-tests\regulation-probe-results\external-matrix-jRY1Wy\report.json` et `audit.json`, hors Git. Les warnings de capture de snapshots du workspace apparaissent pendant la sonde ; l'auditeur confirme que les événements natifs et les reçus requis sont présents.

## Frontière de qualification

Cette campagne prouve la reconstitution de crédits externes pour les 19 types avec un superviseur et des workers GenOS réels. La sonde insère encore parent, contrats et runs dans SQLite. Un essai distinct du vrai CLI `genos_orchestrate` a sélectionné et exécuté `scout_cell` depuis `native_objectives`, puis son run a été bloqué par `require_independent_verification` et le parent a expiré faute de modèle local utilisable. La preuve de cet essai est dans `D:\GenOS-regulation-tests\regulation-probe-results\native-orchestrate-Hlrr9Y\audit.json`.

Pour la réussite complète, il reste à faire créer le helper et les baux par le plan scellé de `genos_orchestrate`, réconcilier les transferts après crash, fournir la vérification indépendante exigée pour chaque méthode native, obtenir une clôture terminale du parent et rejouer la matrice 19 × 2 via le vrai outil MCP avec son auditeur.

Une sonde fournisseur complémentaire injecte une réponse HTTP perdue après le commit du transfert. L'adaptateur relit alors le reçu signé par `operationId` et une mesure fraîche, sans second débit. Cette preuve couvre la réponse perdue ; elle ne couvre pas encore un redémarrage du backend entre le transfert et sa persistance.
