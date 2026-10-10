# Régulation supervisée des 19 types de workers natifs

- **Type** : preuve expérimentale et protocole de validation
- **Statut** : implémenté pour la restauration d'état simulé depuis un checkpoint vérifié
- **Portée** : les 19 types de `workerKindService.KINDS` dans `runDeterministicWorker`
- **Dernière revue** : 2026-10-10

## Contrat vérifié

Le runtime vérifie avant et après la méthode : énergie ≥ 0,4 ; intégrité ≥ 0,5 ; survie < 0,7 ; stress ≤ 0,7. Ces seuils sont ceux de `regulatoryBridgeService.functional`. Le cortisol est suivi mais n'est pas un seuil d'admission. Un état hors plage entraîne un refus `REGULATORY_RECOVERY_REQUIRED`, sauf si le contrat persisté référence un checkpoint sain restauré par un vrai `recovery_worker`.

Le superviseur compare le checkpoint SQLite, le contrat et le run du `recovery_worker`, le rapport de preuve, le reçu de restauration et le SHA-256 du fichier réellement restauré. Il consomme le checkpoint une seule fois et persiste l'état restauré avec une nouvelle révision. Le snapshot suit [`regulatory-snapshot.schema.json`](../../spec/regulatory-snapshot.schema.json). Un RPE nul ne modifie pas l'état ; le feedback seul ne relève pas énergie ou intégrité.

## Résultats du 10 octobre 2026

La sonde [`test_real_worker_regulation.cjs`](../../backend/tests/probes/test_real_worker_regulation.cjs) crée une base SQLite isolée, un parent et des contrats, puis utilise le vrai `runDeterministicWorker`. Pour chaque type, deux cycles partent d'énergie 0,2, intégrité 0,3, survie 0,8, stress 0,9 et cortisol 0,9. Chaque cycle emploie un nouveau checkpoint sain et un vrai `recovery_worker`. Le `sub_orchestrator` délègue lui-même à un véritable enfant.

| Essai | Résultat |
| --- | --- |
| Récupération, 19 types × 2 cycles | 38/38 runs terminés et 38/38 états dans la plage |
| Durabilité | 38/38 états relus correctement depuis SQLite |
| Preuves du cycle natif | 38/38 triplets démarrage, rapport, fin ; audit par run |
| Checkpoint consommé une seconde fois | Refusé |
| Perturbation sans preuve, 19 types | 19/19 refus avant méthode |
| Fichier restauré puis altéré | Refusé avant méthode |
| Services de régulation | 7/7 tests réussis |

Les JSON et bases de la sonde sont dans un dossier frère du dépôt, `../regulation-probe-results/`, sur le même disque. Les preuves de run sont relues par [`audit_real_worker_regulation.py`](../../backend/tests/probes/audit_real_worker_regulation.py). La matrice native existante vérifie séparément les 19 méthodes et contrats d'artefacts.

## Reproduction

Depuis la racine du dépôt, avec les dépendances installées :

```powershell
node --test backend/tests/probes/test_regulatory_services.cjs
node backend/tests/probes/test_real_worker_regulation.cjs
$env:GENOS_REGULATION_RECOVERY='1'
node backend/tests/probes/test_real_worker_regulation.cjs
python backend/tests/probes/audit_real_worker_regulation.py resultats-workers-recuperes.json
$env:GENOS_REGULATION_TAMPER='1'
node backend/tests/probes/test_real_worker_regulation.cjs
```

Toutes ces commandes renvoient 0 si leur critère est satisfait. `GENOS_REGULATION_OUTPUT_DIR` déplace les données générées. L'essai sans récupération et l'essai altéré réussissent précisément lorsque le runtime refuse l'exécution. Des messages auxiliaires `not a git repository` ou de snapshot concurrent peuvent apparaître dans le dossier de sonde ; les statuts de run et les événements SQLite sont les critères vérifiés.

## Limites de la qualification

Le parent, la mission et les contrats de la sonde sont préparés directement en base. Le protocole ne couvre pas la planification de `genos_orchestrate`, les workers non déterministes, ni la reconstitution de ressources externes. La restauration prouvée est un rollback de l'état **simulé**. Lorsque les variables reflètent une ressource réelle, il faut une mesure externe et un acte de récupération distinct. Voir [ADR 0395](../adr/0395-regulation-supervisee-workers-natifs.md). Le [plan de qualification restant](qualification-regulation-ressources-orchestrate.md) détaille les travaux et critères de preuve.
