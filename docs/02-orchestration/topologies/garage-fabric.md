# Garage Fabric : circulation, conservation et reprise des workers

- **Statut** : Implémenté — runtime Node durable raccordé, validation spécialisée exécutable ; limites ci-dessous.
- **Dernière revue** : 2026-10-06 ; [ADR 0312](../../adr/0312-garage-fabric-adaptatif.md).
- **Portée** : admission, capacité, file SQLite, preuve terminale, suspension,
  restauration des fichiers et redémarrage borné.
- **Attention** : une validation du composant ne rend pas verte la validation
  globale du monorepo.

## 1. Definition et relation a la morphogenese

La morphogenese choisit les roles, la topologie, les dependances et le contrat
de mission. Garage Fabric controle leur circulation dans le runtime :
qui execute, qui attend, qui est conserve et comment une execution reprend.

Une topologie n'est pas un slot. Un slot n'est pas une preuve.
Une file persistante n'est pas une garantie de resultat.

Les noms des modes reprennent des principes de garages physiques, pas leurs
mecanismes mecaniques. Il n'y a ni simulation industrielle, ni garantie
d'optimalite globale, ni preuve de superiorite sur un parking physique.

Sans mode explicite, le plan utilise une heuristique deterministe et expose
ses scores. Le routage utilise aussi les observations de cout persistees ;
cela ne constitue pas un apprentissage par renforcement implicite.

## 2. Architecture et raccordements

| Composant | Responsabilite |
|---|---|
| garageFabricService | Plan pur et facade compatible |
| garagePolicies | Classement, dependances et limites par voie |
| garageRequests | Validation, identite et perimetre persistes |
| garageQueueStore | Journal SQLite, idempotence, claims et fencing |
| garageDomainService | Binding durable parent/racine/perimetre et plafonds locaux |
| garageAdmissionService | Admission operateur et adoption du runtime |
| garageQueueDispatcher | Reservation transactionnelle puis lancement |
| [garageReservationGuard](../../../backend/src/services/garageReservationGuard.js) | Contrôle du claim courant et exclusion d'une identité déjà réservée |
| garageRuntimeService | Bail executable, liaison au run, surveillance |
| garageRuntimeEvidence | Preuve typee de la tentative courante |
| garageProcessControl | Observation et arret effectivement confirme |
| garagePreemptionService | Automate durable freeze/thaw |
| garageCapsuleService | Snapshot des fichiers et budget restant |
| [garageCapsuleRetention](../../../backend/src/services/garageCapsuleRetention.js) | Protection des fichiers pendant freezing et freeze_failed contre le GC |
| [garageQueueControl](../../../backend/src/services/garageQueueControl.js) | Contrôle autorisé : freeze, resume, cancel et renew |
| garageSchedulingService | Preemption, reprise, operation interrompue |
| garageRoutingService | Affinite et cout observe |
| workerGarageService | Capacite locale et projet |

Le backend demarre une boucle periodique et l'arrete avant de fermer SQLite.
Plusieurs processus peuvent partager la base : le claim est transactionnel,
pas seulement protege par un verrou JavaScript.

Le demarrage commun des workers adopte les parcours CLI/gRPC qui n'ont pas
encore de demande Garage. Leurs contrats et barrieres de preuves restent
obligatoires. L'admission differee REST utilise le dispatcher durable.

Les workers Branch/Sandbox/Container non encore provisionnes passent par le
cycle existant de creation de capsules. Un workspace deja provisionne
n'est pas recopie.

Raccordements vérifiables : [bootstrap de mission](../../../backend/src/services/agentRuntimeAdapter/missionExecution.js),
[routes REST](../../../backend/src/routes/deployRoutes.js) et
[sept suites Garage](../../../backend/tests/run_validation_suite.js).
Les garanties du runtime supervisé restent décrites dans
[Runtime agentique](../../01-concepts/runtime-agentique.md).

## 3. Douze modes et effets executables

| Mode | Principe repris | Effet GenOS |
|---|---|---|
| surface | Acces direct | FIFO et vieillissement |
| ramp | Circulation hierarchisee | Dependances satisfaites seulement apres completed |
| stacker | Empilement compact | Une execution par voie, LIFO court et vieillissement anti-famine |
| puzzle | Rearrangement | Priorite et suspension consentie pour une urgence |
| tower | Zonage dense | Deux executions Garage maximum par voie, sous les plafonds |
| carousel | Rotation | Favorise les orchestrateurs moins servis sur la derniere heure |
| reciprocal_lift | Extraction prioritaire | Urgence avant priorite ; preemption sure |
| shuttle | Desserte de pools | Affinite de role et de mission du worker designe |
| agv | Routage instrumente | Cout moyen verifie, penalise par le taux d'echec |
| pallet | Capsule independante | Refus sans isolation dans l'identite persistee |
| cold_storage | Conservation froide | Demande dormante et reveil explicite |
| collector | Conservation d'un specialiste | Affinite, identite conservee et preemption interdite |

Le routage compare des demandes associees a des workers existants. Il ne
cree pas un agent AGV, ne change pas son role et n'accorde pas de nouveaux
outils. En l'absence de cout observe, estimatedCost reste une estimation.

La voie lane vaut par defaut le role. Les limites stacker/tower concernent
les executions Garage ; elles ne remplacent pas la capacite globale.

## 4. Adapter les modes a GenOS

Un mode principal se compose avec les regles transversales : autorite,
capacite, isolation, budget, bail et preuve. Tout activer pour chaque demande
serait contre-productif.

Exemples :

- Reparation courte : surface et budget borne.
- Preuve puis synthese : ramp et dependances explicites.
- Evaluations homogenes : stacker sur une voie commune.
- Concurrence entre parents : carousel.
- Intervention urgente : reciprocal_lift et candidat consentant.
- Specialiste reutilisable : shuttle ou collector.
- Travail rarement demande : cold_storage puis reveil.
- Fichiers strictement isoles : pallet.

Un mode inconnu est refuse. Aucun mode ne dispense des gates de mission.

## 5. Invariants

1. Parent et worker sont lies et partagent le workspace.
2. Organisation et projet viennent de SQLite, pas du corps HTTP.
3. Autorite, outils et circuit breaker sont reverifies avant dispatch.
4. Claim et reservation de capacite sont dans la meme transaction.
5. Un worker n'a pas deux claims executables concurrents.
6. Une tentative porte un UUID de bail : un ancien callback est cloture.
7. Un ACK de lancement ne produit jamais completed.
8. Une fin exige le run courant termine et un artefact type valide.
9. Les gates de promotion et l'approbation humaine restent obligatoires.
10. Le slot d'un worker suspendu n'est libere qu'apres arret confirme.
11. Une capsule est liee au worker, au parent et au workspace.
12. Le thaw verifie les checksums et deduit la consommation observee.
13. Une erreur de freeze/thaw n'est jamais convertie en succes.
14. Restaurer les fichiers ne restaure pas la RAM d'un processus.

## 6. Automate durable

status conserve les etats historiques ; phase decrit le sous-etat runtime.

```text
queued/ready -> claimed/ready -> running/ready
                                   |-> completed/ready
                                   |-> failed/ready
                                   |-> expired/ready
                                   |-> running/awaiting_approval

running/ready -> running/freezing -> queued/frozen
queued/frozen -> queued/thawing -> queued/ready -> nouveau claim

queued/dormant -> queued/ready                 (reveil)
queued ou running -> cancelled/ready           (annulation sure)
freezing interrompu -> freeze_failed           (controle operateur)
thawing interrompu -> frozen                   (restauration reessayable)
```

La saturation laisse une demande en file sans abandonner de slot.
freezing, freeze_failed et cancelling maintiennent une reservation
conservatrice. Une capsule frozen ne consomme plus de slot, mais son worker
n'est pas disponible pour une autre mission.

## 7. SQLite, idempotence et bornes

garage_queue conserve les identifiants et le perimetre, le mode, la mission,
la priorite, la voie, l'empreinte canonique, la politique, les tentatives,
les phases, les deadlines, le bail, la capsule, le run et les erreurs.

garage_events est un journal sequence des transitions. garage_capsules
conserve l'etat JSON et son SHA-256. workspace_snapshots reference le
manifeste et les fichiers durables.

Un requestId identique avec le meme contenu retrouve la demande. Un contenu
different produit un conflit. La deadline par defaut n'est pas regeneree
lors d'une repetition idempotente.

Bornes : 256 KiB par demande, 32 dependances, 1000 demandes non terminales
par orchestrateur. Deadline par defaut : une heure ; borne maximale : 24 h.

La migration additive peut etre rejouee. Une ancienne ligne sans run lie
ni artefact valide ne devient pas une preuve par le seul effet de migration.

## 8. Capacite, equite et backpressure

La reservation utilise BEGIN IMMEDIATE pour les controles local et projet,
y compris pour les appelants directs historiques. La capacite dynamique
sauvegardee dans les metadonnees du parent peut etre rehydratee.

Le plafond projet compte les workers actifs du projet meme lorsque leur
parent direct est un worker. Ce comptage utilise leur `workspace_id` persiste
ou, s'il manque, celui du parent immediat. Une chaine d'ancetres sans
workspace doit etre normalisee avant d'etendre cette garantie a une
hierarchie recursive ([ADR 0372](../../adr/0372-fondation-garages-hierarchiques-et-plafond-projet.md)).

La premiere admission enregistre aussi un domaine Garage durable. Ses
plafonds de file et de workers actifs bornent les admissions locales. La vue
`garage_active_reservations` projette les places occupees depuis les agents
et claims persistants ; elle ne constitue pas un second compteur independant.
Le binding parent/racine/perimetre est immuable. La profondeur de delegation
worker reste celle de l'[ADR 0353](../../adr/0353-delegation-worker-bornee-et-admission-runtime.md),
malgre ce registre ([ADR 0374](../../adr/0374-registre-durable-des-domaines-garage.md)).

Les demandes dont le parent ou le projet est plein sont sautees.
Un parent sature ne doit pas bloquer un autre parent admissible.

Le classement combine politique et vieillissement en minutes. Carousel
utilise le nombre de demarrages par parent sur la derniere heure.
Ce n'est pas une garantie de part egale entre tenants ni un quota
organisationnel independant du plafond projet.

## 9. Baux, heartbeat et redemarrage

Le bail du store vaut par defaut 60 secondes et est borne entre 1 et 300 s.
Un runtime vivant, encore dans sa deadline, peut recevoir un renouvellement.
Un bail expire ne se renouvelle pas.

Un claim abandonne avant lancement retourne en file, avec un nouvel UUID
au prochain claim. Un ancien callback ne peut pas modifier son successeur.

Un runtime vivant n'est pas declare mort parce que SQLite a expire son bail.
L'arret est demande puis verifie avec PID et etats en memoire. Une erreur
de permission sur un PID maintient le doute et la reservation.

La boucle reprend les demandes admissibles apres redemarrage. Elle ne
relance pas aveuglement une mission active et ne rejoue pas automatiquement
un echec mutable sans capsule. Une operation interrompue reste conservatrice
tant que son proprietaire parait vivant.

## 10. Preuve terminale

Le runtime lie la demande a son strategy_execution_run. La preuve exige :

- Un run du worker termine selon la gate existante.
- Un evenement terminal portant exactement son executionRunId.
- Un artefact conforme au contrat type et a sa provenance.
- Un perimetre persiste coherent et un worker non en quarantaine.
- Une tentative non cloturee par un autre bail ou son expiration.

Le resultat contient runId, artifactHash et les metriques du run.
Un ancien artefact, verified=true transmis par un lanceur, un recu forge
ou un worker termine sans preuve ne satisfait pas ces conditions.

Une approbation humaine attendue n'est pas une reussite. Garage Fabric ne
signe pas de certificat de promotion a la place des gates epistemiques.

## 11. Preemption et snapshot/freeze/thaw

Le consentement est opt-in : preemptible=true. Collector reste protege.
Puzzle et reciprocal_lift peuvent suspendre une execution courante du meme
parent pour une urgence >= 0,8, sans capacite et avec une priorite
strictement superieure. Le candidat possede un workspace suivi.

Le freeze verrouille sa phase, demande l'arret, attend sa confirmation,
puis capture le workspace isole. Les fichiers sont stockes sous le
workspace durable, et non seulement dans le repertoire jetable du worker.

La source doit être une capsule gérée (`.genos-agent-worlds` ou sous
`GENOS_CAPSULE_ROOT`) dont le nom correspond au worker ou commence par son
identifiant suivi de `_`. La racine partagée et la capsule d'un autre worker
sont refusées, même si le chemin est fourni par un appelant.

La capsule conserve identite, mission et consommation observee.
Le thaw verifie la liaison, le SHA-256 de l'etat, le manifeste et les fichiers.
Il materialise une nouvelle capsule, jamais le workspace partage de
l'operateur. Un etat altere laisse le worker bloque.

Pour `tokens`, `costUsd`, `events` et `latencyMs` :
`reste = max(0, allocation - consommation)`. Allocation et consommation
proviennent du run persisté ; une dimension non mesurée ou épuisée interdit
la reprise. Seule l'allocation de zéro token explicitement déterministe est
admise. Un redémarrage ne régénère pas artificiellement le budget.

Les capsules non froides peuvent etre remises en file lorsque la capacite
revient. Cold_storage exige un reveil explicite.

Le nettoyage differe des workspaces conserve les fichiers en freezing ou
freeze_failed, meme si le delai de GC vaut zero. Le payload valide est
stocke hors du workspace jetable ; son nettoyage ulterieur n'efface donc
pas la sauvegarde necessaire a la reprise.

Limite : il s'agit d'un redemarrage depuis les fichiers et l'etat declaratif.
Sockets, transactions externes, pile native et contexte interne du
fournisseur LLM ne sont pas restaures. Les effets externes anterieurs
doivent disposer de leur propre idempotence.

## 12. API operateur

Routes sous /api. Lectures limitees au tenant selectionne ; mutations
avec workspace:write et controle du parent sur le worker.

| Methode | Route | Usage |
|---|---|---|
| GET | /agents/:id/workers/garage | Capacite et workers actifs |
| GET | /agents/:id/workers/garage/queue | Demandes, compteurs, politiques |
| GET | /agents/:id/workers/garage/events?after=N | Journal sequence |
| POST | /agents/:id/workers/:workerId/dispatch | Admission durable |
| POST | /agents/:id/workers/garage/queue/:requestId/freeze | Suspension consentie |
| POST | /agents/:id/workers/garage/queue/:requestId/resume | Reveil ou restauration |
| POST | /agents/:id/workers/garage/queue/:requestId/cancel | Annulation apres arret |
| POST | /agents/:id/workers/garage/queue/:requestId/renew | Renouvellement cloture |

Exemple de corps :

```json
{
  "requestId": "repair-parser-01",
  "mission": "Corriger le parseur avec des preuves executables",
  "mode": "puzzle",
  "priority": 0.9,
  "urgency": 0.9,
  "preemptible": true,
  "lane": "parser",
  "executionBudget": { "tokens": 2000, "costUsd": 1, "events": 40 }
}
```

La reponse 202 distingue queued, started, status et requestId :
elle n'atteste pas un resultat.

`queueIfFull` permet l'attente durable par défaut. Avec `queueIfFull: false`,
une saturation produit un refus au lieu d'une attente. `dependsOn` contient
des identifiants de demandes Garage, pas des noms de rôles : leur état
`completed` exige lui aussi la preuve terminale de la tentative courante.

Le corps ne remplace pas workspace, role persiste, identite du parent
ou permissions d'outils. Un payload de signal reste une donnee non fiable.

## 13. Diagnostic et exploitation

| Erreur | Signification |
|---|---|
| GARAGE_SCOPE_INVALID | Identite ou tenant incoherent |
| GARAGE_IDEMPOTENCY_CONFLICT | Identifiant reutilise avec un autre contenu |
| GARAGE_FENCE_REQUIRED / GARAGE_STALE_LEASE | Tentative non autorisee |
| GARAGE_EVIDENCE_REQUIRED | Fin sans preuve du run courant |
| GARAGE_STOP_UNVERIFIED | Arret du processus non confirme |
| GARAGE_CAPSULE_CORRUPT | Etat ou payload altere |
| GARAGE_PREEMPTION_PROTECTED | Absence de consentement ou collector |
| GARAGE_BUDGET_EXHAUSTED | Aucun budget restant pour reprendre |
| GARAGE_BUDGET_UNKNOWN | Allocation ou consommation non mesuree |

En freeze_failed, examiner le journal et le processus, puis annuler
explicitement avant de reallouer l'identite. Ne pas ecrire status=idle
pour masquer un arret non confirme.

Le journal des transitions n'archive pas les prompts. Les missions
persistees et fichiers restent des donnees du projet : confinement et
gestion des secrets des snapshots existants restent obligatoires.

## 14. Validation executable et couverture

```bash
npm run test:garage
node backend/tests/run_validation_suite.js garage
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Huit suites specialisees couvrent plans purs, SQLite reel, lecture par un
nouveau processus, connexions concurrentes, scope, idempotence, ACK non
probant, compensation, ancien bail, calcul deterministe reel, artefact
type, recu forge, processus enfant vivant, payload durable, corruption,
thaw, budget restant, controles operateur, domaines durables et les douze politiques.

Les commandes ci-dessus s'exécutent depuis la racine du dépôt. Depuis
`backend/`, lancer `node tests/run_validation_suite.js garage`.
Le `npm test` racine inclut le profil Garage ; le `npm test` du seul backend
ne remplace pas ce profil dédié. Un test vérifiant `freezing`/`freeze_failed`
avec GC immédiat couvre la rétention du workspace source.

Certains scenarios injectent les adaptateurs d'autorite ou de lancement.
Cela isole les garanties du garage ; ce n'est pas une certification d'un
fournisseur distant ou d'une session LLM restauree.

La validation globale doit rester rapportee avec son exit code exact.
Les violations preexistantes ou concurrentes ne deviennent pas vertes
parce que les tests specialises passent.

## 15. Non-objectifs et limites

Pas de restauration exacte de processus, d'ordonnancement hors SQLite,
de quotas independants par organisation, de garantie exactly-once sur
les effets externes, ni de reconfiguration arbitraire des contrats worker.

Garage Fabric ne remplace ni morphogenese, ni sandbox, ni leases MCP,
ni circuit breaker, ni barrieres de preuves.
