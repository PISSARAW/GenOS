# ADR 0616 — Hystérésis transactionnelle et adaptateurs externes signés

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : morphogenèse, hystérésis, expérimentation, attestations
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0573, ADR 0602, ADR 0610

## Contexte

Le protocole P0 liait le plan complet à l'autorité Rust, mais l'hystérésis
restait stockée dans un fichier global au processus CLI. Deux tenants ou deux
missions partageaient donc budget et temporisation, et Rust consommait cet état
avant que le commit Node soit durable. Une panne ou un rollback pouvait épuiser
le budget sans transition validée.

Le runner P3 vérifiait les empreintes des binaires externes, mais une
configuration pouvait encore déclarer elle-même `external-framework` et un reçu
pouvait annoncer ses propres métriques. Cette auto-attestation ne suffisait pas
à qualifier une exécution concurrente réelle.

## Décision

1. SQLite devient la source de vérité de l'hystérésis, indexée par
   organisation, projet et mission. Node transmet l'état versionné à Rust.
2. Rust vérifie le périmètre contre l'autorité Ed25519, restaure budget et
   cooldown, puis retourne une transition d'état proposée sans la persister.
3. Node applique cette transition par comparaison de version dans la même
   transaction que le commit, les snapshots et l'état collectif. Un conflit ou
   un rollback ne consomme pas le budget.
4. Un adaptateur externe de production exige une attestation Ed25519 statique
   qui lie framework, version, exécutable et artefact à une clé d'un faisceau de
   confiance opérateur.
5. Chaque reçu externe est signé par cette même clé et lié à la tentative. La
   latence admissible est mesurée par le superviseur hôte ; la valeur déclarée
   dans le reçu reste seulement une observation contrôlée.
6. Un invocateur injecté dans les tests n'est jamais une source de preuve
   d'exécution réelle. Une fixture non signée conserve `realExecution: false`.
7. Ces mécanismes ferment des frontières de preuve, mais n'activent aucun
   commit adaptatif et ne démontrent aucune supériorité de GenOS.

## Conséquences

### Positives

- les missions et tenants ne partagent plus un budget global accidentel ;
- autorisation et consommation d'hystérésis sont atomiques et concurrentes par
  comparaison de version ;
- une configuration ou un mock ne peut plus s'auto-promouvoir en exécution
  externe réelle ;
- les dépassements de latence reposent sur une mesure hors du processus évalué.

### Négatives

- la production doit distribuer et faire tourner les clés Ed25519 des wrappers
  externes, puis gérer leur rotation dans `GENOS_P3_ADAPTER_TRUST_JSON` ;
- les anciennes configurations `external-framework` non attestées échouent
  désormais fermées ;
- une collision de version oblige à recalculer l'autorité depuis l'état courant.

## Alternatives rejetées

- **Conserver un fichier d'hystérésis par machine** : il ne fournit ni isolation
  tenant ni atomicité avec le commit SQLite.
- **Persister l'hystérésis dans Rust avant le commit** : un rollback Node
  consommerait encore du budget.
- **Faire confiance à `evidenceScope`** : ce champ est une déclaration de
  configuration, pas une preuve indépendante.
- **Faire confiance à la latence du reçu** : le processus évalué pourrait la
  sous-déclarer.

## Vérifications associées

- `node backend/tests/test_morphogenesis_hysteresis_store.js` ;
- `node backend/tests/test_morphogenesis_production_authority.js` ;
- `node backend/tests/test_morphology_search_p3.js` ;
- `cargo test -p genos-cli morphogenesis_hysteresis` ;
- gates globaux définis dans `AGENTS.md`.
