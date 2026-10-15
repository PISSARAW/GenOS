# ADR 0531 — Recevoir les entrées sensorielles et neuro-gliales dans le backend

- **Statut** : Accepté pour les parcours HTTP locaux
- **Date** : 2026-10-15
- **Domaine** : Biomimétisme, provenance, backend, CLI Rust
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0516 — Provenance sensorielle synthétique signée; ADR 0518 — Producteur neuro-glial signé

## Contexte

Les signaux sensoriels typés et les événements neuro-gliaux signés étaient validés
dans des chemins CLI ou orchestrateur, sans point d'entrée backend tenant-scopé.
Une requête HTTP authentifiée ne prouve pas à elle seule l'identité du producteur,
et une preuve de producteur ne prouve pas que le capteur ou son contenu est réel.

## Décision

Ajouter deux parcours protégés par l'autorisation d'expérimentation et le contrôle
d'appartenance de mission au tenant :

- `POST /api/rust/missions/:missionId/sensory-receipts` vérifie l'enveloppe,
  l'identité du producteur épinglée dans `GENOS_SENSORY_TRUST_JSON`, la signature
  Ed25519, le tick et le signal typé avant d'écrire un reçu SQLite immuable. Une
  relecture exacte est idempotente; un conflit ou un tick périmé est refusé.
- `POST /api/rust/neuro-glia/events` transmet un événement signé au CLI, avec la
  confiance producteur épinglée dans `GENOS_NEURO_GLIA_TRUST_JSON` et un journal
  séparé par organisation/projet. La mission doit appartenir au tenant avant
  l'appel du CLI.

Les deux parcours restent expérimentaux et ne démontrent que les contrats et
persistance testés localement. Le reçu sensoriel backend n'est pas encore transféré
au journal Rust ni consommé par le PAF. Le reçu neuro-glial Rust ne lie pas encore
cryptographiquement le principal et le tenant backend; la route HTTP ne constitue
pas une capacité d'autorité équivalente au pont métabolique de l'ADR 0529.

## Conséquences

### Positives

- Les entrées sensorielle et neuro-gliale passent par une autorisation HTTP
  authentifiée et un contrôle de tenant avant persistance ou exécution CLI.
- La route sensorielle refuse signatures invalides, signaux hors schéma, conflits
  d'idempotence et ticks obsolètes, et rend ses reçus immuables.
- Les clés des producteurs restent distinctes de l'identité du principal backend.

### Négatives

- Les clés publiques approuvées sont configurées par l'hôte; leur provisioning,
  rotation et révocation en production ne sont pas démontrés.
- Les signaux sont synthétiques. Une signature prouve une clé approuvée, pas un
  capteur physique ni la vérité sémantique du signal.
- Les parcours ne couvrent ni ingestion backend vers PAF, ni principal signé dans
  le reçu Rust, ni transport distribué ou déploiement multi-instance.

## Preuve d'intégration

Les tests HTTP locaux passent :

- `node backend/tests/test_synthetic_sensory_ingestion_http.cjs` couvre refus
  d'authentification, mission hors tenant, altération/signature invalide sans
  persistance, replay idempotent, conflit divergent et tick périmé.
- `node backend/tests/test_neuro_glia_http.js` couvre refus sans authentification,
  mission hors tenant, preuve invalide, route autorisée et relais de configuration
  vers le CLI.
- `node --test backend/tests/test_neuro_glia_bridge.js` passe 3/3.

Ces tests utilisent des clés et données synthétiques dans un environnement local.
Ils ne valident pas un déploiement multi-instance ni la provenance d'un capteur réel.

## Alternatives

- Accepter les reçus depuis les routes sans vérifier la preuve du producteur :
  écarté, car le contrôle de tenant ne lie pas l'émetteur au contenu.
- Présenter ces routes comme une autorité durable backend/CLI : écarté, car le
  principal backend n'est pas signé dans le reçu neuro-glial et le reçu sensoriel
  n'est pas encore consommé par le runtime Rust/PAF.
