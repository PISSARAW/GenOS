# Garage Fabric : morphogenèse adaptative des workers

- **Statut** : fondation runtime partielle
- **Portée** : control plane Node, admission et capacité des workers
- **Implémentation** : `backend/src/services/garageFabricService.js` et
  `backend/src/services/workerGarageService.js`

## 1. Définition

Le **Garage Fabric** est une couche de décision au-dessus du garage de
workers. Il choisit une stratégie de circulation pour une mission en fonction
de son urgence, de sa persistance, de son besoin d'isolation, de sa
spécialisation et de la capacité disponible.

Il ne s'agit pas d'une simulation mécanique. Les termes `puzzle`, `tower`,
`AGV` ou `carousel` sont des noms de politiques ; ils ne deviennent des
garanties opérationnelles que lorsqu'un adaptateur runtime et un test de
contrat les raccordent.

$$
\text{GarageFabric}(R, G, W) \\mapsto
\langle \text{mode}, \text{admission}, \text{lease}, \text{recovery} \rangle
$$

où $R$ est la demande, $G$ l'état du garage et $W$ les workers observés.

## 2. Les douze morphologies de garage

| Mode | Intention GenOS | Condition typique |
|---|---|---|
| `surface` | voie directe | mission courte, faible isolation |
| `ramp` | partage hiérarchique | organisation multi-niveaux |
| `stacker` | capacité simple | workers homogènes |
| `puzzle` | réarrangement logique | forte demande et slots occupés |
| `tower` | réservation verticale | persistance et sous-orchestration |
| `carousel` | rotation équitable | concurrence entre missions |
| `reciprocal_lift` | extraction prioritaire | urgence élevée |
| `shuttle` | routage séparé de l'identité | worker persistant, missions successives |
| `agv` | sélection autonome | forte spécialisation ou isolation |
| `pallet` | capsule indépendante | isolation du workspace |
| `cold_storage` | suspension durable | worker persistant peu urgent |
| `collector` | worker patrimonial | spécialisation et historique précieux |

Le mode explicite dans la requête domine l'heuristique. Sans mode explicite,
le service retourne le score de chaque politique et la politique gagnante.
Les scores sont des heuristiques déterministes, pas une optimisation globale.

## 3. Admission

La décision comporte quatre terminaux :

```text
available > 0                 → admit
urgent + candidat préemptable → preempt
sans capacité mais queueable   → queue
sans capacité non queueable    → reject
```

`preempt` ne signifie pas « tuer le worker ». Il signifie qu'un candidat est
identifié et qu'un adaptateur doit d'abord produire et vérifier un snapshot.
`buildSnapshotPlan()` encode cette obligation.

## 4. Lease et file

Une lease contient :

```json
{
  "leaseId": "orchestrator:worker:timestamp",
  "orchestratorId": "...",
  "workerId": "...",
  "issuedAt": 1000,
  "expiresAt": 301000,
  "mode": "shuttle"
}
```

Une lease expirée ne peut pas être renouvelée. La file est persistée dans
`garage_queue`, ordonnée par priorité puis ancienneté, et survit au
redémarrage du backend. Une lease expirée devient `expired` ; elle doit ensuite
être réconciliée par un opérateur ou un worker de reprise. Le dispatcher
raccordé au garage claim la prochaine entrée après une libération de slot.

## 5. Invariants de sûreté

1. Le Garage Fabric ne contourne jamais `workerGarageService`.
2. Les workers `quarantined`, `terminating`, `completed` ou `failed` ne sont
   pas préemptés par défaut.
3. Une préemption sans snapshot vérifié est invalide.
4. La capacité est une autorisation d'exécution, pas une preuve de succès.
5. Les contrats worker, leases d'outils, budgets, workspaces et barrières de
   preuves restent obligatoires.

## 6. Boucles de contrôle

### 6.1 Boucle rapide

Admission, choix de mode, renouvellement de lease et classement de la file.

### 6.2 Boucle structurelle

Pause, snapshot, libération de slot, création de capsule, reprise et
réconciliation après crash sont raccordés par `garagePreemptionService` et
`garageQueueDispatcher`.

### 6.3 Boucle évolutive

Future intégration : calibration des scores à partir de mesures de latence,
coût, taux d'échec et qualité des preuves. Aucune optimisation apprise n'est
affirmée par la présente tranche.

## 7. Ce qui reste à raccorder

- réconciliation automatique des leases expirées au redémarrage ;
- télémétrie détaillée des claims, préemptions et reprises ;
- télémétrie des transitions de mode ;
- mesure de fairness par projet et tenant ;
- gates empêchant de promouvoir une reprise sans artefact valide.

## 8. Vérification

Les tests ciblés `test_garage_fabric.js`, `test_garage_fabric_persistence.js`
et `test_garage_queue_dispatcher.js` vérifient les modes, la file SQLite, les
leases, le cycle freeze/thaw injecté et le dispatcher. Ils ne démontrent pas
la qualité des artefacts produits par une mission relancée.
