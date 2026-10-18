# ADR 0610 — Fermer le protocole P0 du commit morphogénétique

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : morphogenèse, autorité, transaction, reprise
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0407, ADR 0412, ADR 0573, ADR 0602

## Contexte

Le contrôle Rust autorisait un digest de plan et une projection limitée à une
destination, un gain et un coût. Le plan Node complet n'était donc pas interprété
à la frontière d'autorité. En outre, la capture durable précédait les effets,
mais le journal ne distinguait pas explicitement l'intention, le résultat et la
phase terminale. Un arrêt de processus pendant l'application laissait enfin les
snapshots `applying` ou `restoring` sans classification automatique au démarrage.

## Décision

1. La requête signée transmet le plan complet. Rust recalcule son SHA-256 sur une
   représentation JSON canonique, refuse les actions inconnues, les plans trop
   grands et `continueOnFailure`, puis lie sa décision au digest déjà scellé.
2. Chaque transition journalise `PREPARE` avant l'autorité et termine par
   `COMMIT` ou `ABORT`. Chaque action journalise aussi son intention avant effet,
   puis son résultat. Le plan est remesuré immédiatement avant l'application.
3. Au démarrage, une transition seulement `prepared` est annulée par restauration.
   Une transition `applying` ou `restoring` est mise en `recovery_required` : les
   effets externes possibles ne sont jamais déclarés compensés sans preuve.
4. L'auto-approbation ne suffit pas à activer un commit adaptatif. Le canari exige
   simultanément `GENOS_MORPHOGENESIS_COMMIT_CANARY=1`, un opt-in `canary: true`
   et une identité utilisateur/tenant authentifiée. Le défaut reste non mutant.

## Conséquences

### Positives

- Rust voit et contrôle désormais les actions exactes qu'il autorise ;
- le journal permet de séparer une intention sans résultat d'un effet confirmé ;
- un redémarrage ne transforme plus une transition ambiguë en succès implicite ;
- le passage en écriture reste borné à un canari explicitement authentifié.

### Négatives

- les anciennes requêtes authentifiées sans `transitionPlan` sont refusées ;
- une transition interrompue après `PREPARE` peut nécessiter une restauration ;
- les états ambigus exigent une intervention opérateur au lieu d'une reprise
  optimiste ;
- le canari doit fournir le contexte d'identité complet.

## Alternatives rejetées

- **Autoriser le digest sans le plan** : Rust ne peut alors contrôler que la
  signature, pas la sémantique des effets.
- **Journaliser uniquement après l'effet** : un crash entre effet et écriture
  reste indétectable.
- **Rejouer automatiquement `applying`** : cela peut dupliquer un effet externe.
- **Activer le commit par la seule auto-approbation** : ce réglage historique
  n'est pas une autorité de production suffisamment explicite.

## Vérifications associées

- `node backend/tests/test_morphogenesis_production_authority.js` ;
- `node backend/tests/test_morphogenesis_authenticated_commit.js` ;
- `node backend/tests/test_morphogenesis_auto_reeval.js` ;
- `cargo test -p genos-cli morphogenesis_gate` ;
- gates globaux définis dans `AGENTS.md`.
