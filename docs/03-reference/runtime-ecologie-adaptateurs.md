# Runtime d'écologie des adaptateurs

- **Statut** : Implémenté, surface consultative
- **Portée** : qualification, sélection, succession et planification multi-dépôts
- **Dernière revue** : 2026-10-19

## Contrat du symbiote-adaptateur

Le manifeste `genos.adapter-symbiont/v1` est validé par
`backend/src/services/adapterEcology/adapterManifest.js`. Il exige :

- `adapterId`, version sémantique, type et référence du provider ;
- capacités, scopes de données et tool leases sans wildcard ;
- coût, latence, fiabilité et observation de santé datée ;
- cinq dimensions de fitness bornées entre zéro et un ;
- au moins une référence d'attestation ;
- une action de compensation et ses preuves attendues.

`toCapabilityNode` construit un nœud Rhizome canonique. Une santé autre que
`HEALTHY` donne un nœud indisponible. `toSymbiosisContract` applique la
constitution Holobionte, notamment les restrictions de données et le plafond de
dépendance. Ces projections ne démarrent pas le provider.

## Sélection du consortium minimal

`minimalConsortiumService.selectConsortium` reçoit au plus seize manifestes et
une demande comprenant capacités, scopes, leases et plafonds. Le service :

1. refuse les manifestes non sains, périmés ou hors autorité ;
2. applique le classement de partenaires Holobionte ;
3. énumère les sous-ensembles couvrant toute la demande ;
4. choisit la cardinalité minimale, puis le coût, la latence et la fitness ;
5. produit les nœuds Rhizome, contrats Holobionte optionnels et requêtes Garage ;
6. joint la décision de morphologie minimale.

Une requête Garage est un besoin à réserver. Elle ne vaut ni claim, ni lease, ni
preuve d'exécution.

## Dysbiose et succession

`consortiumSuccessionService` compare chaque manifeste aux observations runtime.
Une observation absente, périmée, sans preuve, en échec ou présentant une dérive
de coût/latence rend le symbionte dysbiotique. La recomposition réutilise le
sélecteur minimal après mise en quarantaine du candidat malade.

Le plan de compensation expose `action`, `toolLeases`, attestations et preuves
requises. `authorizeCompensation` ne retourne `AUTHORIZED` que lorsque toutes les
preuves déclarées sont présentes. Il n'appelle jamais l'action externe.

## Métapopulation multi-dépôts

`multiRepositoryMigrationService` traite chaque dépôt comme un dème. Le graphe
`dependsOn` doit être acyclique. Le dépôt pilote forme la première vague ; les
autres sont groupés dès que toutes leurs dépendances sont complètes.

Chaque cible reçoit un propagule `ARTIFACT` validé par le contrat Métapopulation
et par la politique `elite`. `advanceMigration` accepte une vague seulement si
chaque dépôt fournit son reçu et toutes les preuves attendues. Une preuve absente
bloque la campagne. Un rejet demande le rollback des dépôts déjà acceptés.

## Vérification locale

Depuis la racine du dépôt :

```powershell
node backend/tests/test_adapter_symbiont_manifest.js
node backend/tests/test_adapter_minimal_consortium.js
node backend/tests/test_adapter_consortium_succession.js
node backend/tests/test_adapter_multi_repository_migration.js
python scripts/ci/check_code_quality.py
```

## Limites et non-objectifs

- aucun registre durable ni endpoint MCP/REST n'est ajouté dans cette tranche ;
- aucun provider externe n'est démarré et aucun dépôt n'est modifié ;
- les attestations sont des références obligatoires, mais leur signature doit
  être vérifiée par la frontière productrice appropriée ;
- la santé déclarée ne remplace pas une mesure longitudinale indépendante ;
- un plan de rollback n'est jamais présenté comme un rollback accompli.
