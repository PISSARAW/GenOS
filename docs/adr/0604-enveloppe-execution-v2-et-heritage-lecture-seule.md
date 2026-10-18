# ADR 0604 — Sceller l'exécution v2 et classer l'héritage en lecture seule

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : runtime, autorité, reproductibilité, provenance
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0005, ADR 0567

## Contexte

L'enveloppe d'autorité d'exécution v1 liait déjà un run à sa mission, son agent,
son tenant, son workspace, son lease d'outils et son budget. Cependant, elle ne
scellait pas les octets du workspace d'entrée, le binaire exécuté, la version du
runner, les paramètres déterministes ni la politique de preuve. En outre,
l'absence d'enveloppe était retournée sous la forme `legacy_unbound`, état que
certains appelants pouvaient interpréter comme une compatibilité exécutable.

Une migration destructive des événements v1 est exclue : le journal GVX est
append-only, chaîné et authentifié. Réécrire ces événements détruirait précisément
la provenance que l'enveloppe doit garantir.

## Décision

1. Tout nouveau run reçoit, dans la même transaction que sa création, l'état
   `pending`. Il ne devient exécutable qu'après transition atomique vers
   `bound_v2` et publication de son enveloppe dans le journal GVX.
2. L'enveloppe v2 scelle l'identité du run, de la mission, de l'agent et du tenant,
   le hash du binding, le snapshot SHA-256 du workspace, la révision de code, le
   digest du binaire, la version du runner, le lease d'outils et son échéance, les
   budgets bornés, la politique de preuve, les paramètres déterministes et les
   versions d'état.
3. Un nonce est inclus dans l'enveloppe. Le hash, le hash d'événement et le MAC du
   journal GVX forment la référence signée vérifiée par les consommateurs.
4. La migration 134 classe les runs préexistants sans enveloppe v2 en
   `legacy_read_only`. Les événements v1 restent consultables, mais ne peuvent
   plus autoriser une exécution, un outil, une promotion ou une récupération.
5. Toute absence de run, enveloppe, signature ou classification attendue échoue
   fermée. Le moniteur arrête également un runtime lancé sans référence signée.
6. Le snapshot du workspace et le digest de l'exécutable sont remesurés à la
   frontière de démarrage, avant l'exécution effective. Les contrôles MCP Node et
   Rust continuent de dépendre du token acteur émis uniquement pour un run v2
   autorisé.

## Conséquences

### Positives

- un succès de transport ne peut plus compenser une autorité d'exécution absente ;
- un run est reproductible à partir d'entrées et d'un exécutable identifiés ;
- les anciens runs restent auditables sans acquérir rétroactivement une autorité ;
- le contrat rend explicites les inconnues et les bornes de CPU, temps, tokens,
  spawn et délégation ;
- la signature du journal est transportée avec la référence d'autorité.

### Négatives

- le premier scellement et la frontière de démarrage parcourent le workspace ;
- un workspace modifié entre scellement et démarrage est refusé et doit produire
  un nouveau run ;
- les runs v1 ne sont pas relançables : une nouvelle exécution v2 est nécessaire ;
- l'espace disque doit permettre les migrations SQLite et leur sauvegarde de
  précaution sur les bases existantes.

## Alternatives rejetées

- **Conserver `legacy_unbound`** : rejeté, car l'absence de preuve demeurait
  ambiguë à une frontière d'autorité.
- **Réécrire les événements v1** : rejeté, car cela briserait la chaîne GVX et
  fabriquerait une provenance rétroactive.
- **Accepter un hash fourni par l'appelant** : rejeté, car le contrôle plane doit
  mesurer les octets qu'il autorise.
- **Vérifier le workspace après chaque événement** : rejeté, car les écritures du
  runtime sont attendues ; la vérification porte sur la frontière pré-exécution.

## Vérifications associées

- `node backend/tests/test_execution_authority_v2.js` ;
- `node backend/tests/test_mission_authority_envelope.js` ;
- `npm --prefix backend run test:p1-socle` ;
- `python scripts/ci/check_code_quality.py` ;
- `npm test` et `cargo test --workspace` avant promotion du lot complet.
