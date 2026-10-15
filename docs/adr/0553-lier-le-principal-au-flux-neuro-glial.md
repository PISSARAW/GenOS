# ADR 0553 — Lier le principal au flux neuro-glial

- **Statut** : Accepté pour le pont HTTP expérimental
- **Date** : 2026-10-15
- **Domaine** : Autorité backend, tenant, provenance neuro-gliale
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0518 — Provenance signée des producteurs neuro-gliaux; ADR 0531 — Entrées sensorielles et neuro-gliales dans le backend

## Contexte

Le backend authentifiait un principal, vérifiait son appartenance au projet et
contrôlait l'appartenance de la mission. Le producteur signait séparément
mission, tick, producteur et digest d'événement. Le reçu Rust conservait ces
deux résultats sans preuve cryptographique reliant le principal et le tenant
aux claims du producteur.

## Décision

Avant de transmettre un événement au CLI, le backend signe avec Ed25519 un
contrat versionné qui lie principal, organisation, projet, mission Rust,
producteur, identifiant et type d'événement, tick, clé d'idempotence et digest
du payload. La clé privée est fournie par l'hôte via
`GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM`; son identifiant est
`GENOS_NEURO_GLIA_BACKEND_AUTHORITY_ID`. La clé publique correspondante doit
être épinglée dans `backend_authorities` de `GENOS_NEURO_GLIA_TRUST_JSON`.

Le pont transmet cette preuve dans un fichier temporaire privé et demande
explicitement `--require-backend-authorization`. Rust vérifie le sceau backend
et sa concordance avec les claims producteurs calculés avant append. En mode
pont, Rust refuse aussi de rejouer un historique dont un événement n'a pas de
preuve backend. Un champ de preuve présent mais malformé est refusé. Le CLI
local expérimental conserve son mode producteur seul quand l'appelant ne
demande pas le contrat backend.

Le contrôle HTTP continue de vérifier la mission dans le tenant avant
l'exécution. Le backend choisit les claims principal et tenant depuis le
contexte authentifié; ils ne viennent pas des champs déclarés par le client.

## Conséquences

### Positives

- Le reçu durable Rust conserve une preuve vérifiable du principal et du
  tenant qui ont autorisé l'événement.
- Les altérations de principal, tenant, projet, mission, producteur ou contenu
  invalident le sceau ou la concordance des claims avant append.
- Le mode pont rejette les historiques incomplets au lieu de restaurer leur
  population comme s'ils portaient cette autorité.

### Négatives

- Le déploiement doit provisionner et faire tourner une clé privée backend et
  synchroniser sa clé publique épinglée dans le bootstrap Rust.
- Le test local ne démontre ni rotation multi-instance ni gestion distante des
  clés. La signature atteste une clé backend approuvée, pas la vérité
  biologique du signal ou l'existence d'un capteur physique.
- Le quorum et la réponse gliale restent des calculs logiciels locaux; ce
  contrat n'ajoute pas de consensus distribué.

## Vérification

- `backend/tests/test_neuro_glia_bridge.js` refuse une réponse CLI historique
  sans sceau backend.
- `backend/tests/test_neuro_glia_http.js` vérifie le sceau Ed25519 émis après
  authentification et contrôle de tenant.
- `crates/genos-cli/tests/neuro_glia_stream_cli.rs` couvre un append signé,
  l'altération du projet avant append et le refus d'un historique sans sceau.

## Alternatives

- Faire confiance aux champs d'autorisation renvoyés par HTTP sans les signer :
  écarté, car le journal Rust ne pourrait pas les vérifier indépendamment.
- Incorporer la clé du producteur au registre d'autorité backend : écarté, car
  l'identité du principal HTTP et celle du producteur sont distinctes.
