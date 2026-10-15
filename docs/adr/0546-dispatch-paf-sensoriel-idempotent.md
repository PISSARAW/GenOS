# ADR 0546 — Dispatch PAF sensoriel idempotent

- **Statut** : Accepté pour l’ingestion sensorielle expérimentale.
- **Date** : 2026-10-15
- **Domaine** : Ingestion backend des signaux synthétiques et consommation PAF Rust.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0531, entrées sensorielles et neurogliales backend; ADR 0545, racine de confiance hôte.

## Contexte

Le backend vérifie et persiste les reçus synthétiques signés, puis le CLI Rust
les importe avant d’exécuter un tick biologique. Un rejeu HTTP exact devait
retourner le résultat précédent. Sans journal de dispatch durable, le backend
pouvait relancer un tick PAF après que le premier appel avait consommé la
source. Les requêtes concurrentes pouvaient également exécuter le même tick.

## Décision

1. Conserver un ledger distinct des reçus d’entrée, indexé par mission,
   producteur et tick, avec le hash du reçu, un bail de réservation et le
   résultat Rust/PAF final.
2. Réserver le dispatch dans une transaction SQLite `BEGIN IMMEDIATE` avant
   d’appeler le CLI. Une réservation active bloque les appels concurrents; une
   réservation échue peut être reprise. Les hash divergents échouent de façon
   fermée.
3. Finaliser seulement après vérification que le reçu PAF référence le digest
   importé. Un rejeu exact retourne le résultat conservé sans nouvel appel
   biologique. En cas d’échec avant finalisation, libérer le bail pour permettre
   une nouvelle tentative.
4. Garder la portée de confiance backend et les validations de mission,
   producteur et tenant préalables à la consommation Rust.

## Conséquences

### Positives

- Un rejeu exact ne consomme pas une seconde fois la même source et ne crée pas
  un second tick PAF via cette route.
- Une seule requête concurrente détient le bail; les autres reçoivent une
  réponse réessayable sans mutation PAF.
- Le résultat final est durable et permet de répondre de façon stable après un
  redémarrage backend.

### Négatives et limites

- Une panne après le tick Rust mais avant la finalisation SQLite peut laisser un
  effet Rust sans preuve de complétion backend; une reprise dépend de
  l’idempotence de l’import et de la détection de source du runtime.
- Le bail est temporel et n’est pas un verrou distribué au-delà des garanties
  SQLite du fichier partagé.
- Ces reçus et signaux demeurent synthétiques. Ils ne prouvent ni la présence
  d’un capteur physique ni la vérité biologique des mesures.

## Alternatives

- Réutiliser le reçu biologique Rust comme ledger backend : rejeté, car il ne
  porte pas le bail HTTP ni le résultat de dispatch transactionnel.
- Dédupliquer uniquement en mémoire : rejeté, car les redémarrages et appels
  concurrents perdraient l’état.
- Relancer systématiquement le tick pour chaque reçu HTTP : rejeté, car le
  transport et l’import ne garantissent pas l’unicité de l’effet PAF.
