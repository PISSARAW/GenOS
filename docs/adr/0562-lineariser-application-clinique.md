# ADR 0562 — Linéariser l’application d’une autorisation clinique

- **Statut** : Accepté, qualification du CLI à confirmer
- **Date** : 2026-10-16
- **Domaine** : nosologie, autorisation clinique, persistance multi-processus
- **Décideurs** : GenOS
- **Lié à** : ADR 0324, biologie d’exécution et autorité durable; ADR 0546b, dispatch sensoriel idempotent

## Contexte

L’ancien parcours vérifiait l’état de révocation dans SQLite puis répondait au
CLI avant que celui-ci n’ajoute un reçu dans un journal JSONL. Une révocation
pouvait donc être validée entre la lecture et l’append. L’API backend et le CLI
direct doivent utiliser la même identité d’opération durable et rendre les
reprises explicites, y compris après arrêt de processus.

## Décision

1. Donner à une opération l’identifiant stable
   `clinical-apply:<authorization_id>` et la portée composite
   `(organization_id, project_id, authorization_id, operation_id)` dans
   `clinical_authorization_applications`.
2. Acquérir le claim et révoquer l’autorisation au moyen de transactions SQLite.
   Le premier commit décide l’ordre : un claim créé avant la révocation autorise
   cette opération à terminer; une révocation commise avant tout claim refuse
   l’usage. La révocation ne prétend pas annuler un claim déjà acquis.
3. Conserver l’état du claim, son claimant, un jeton de claim, le nombre de
   tentatives, une lease de 60 secondes, puis l’état complété et le résultat
   JSON. Un autre claimant peut reprendre un claim expiré. Le même identifiant
   d’opération déjà complété retourne le résultat mémorisé, même après
   révocation, sans relancer l’effet.
4. Inscrire `operation_id` et `idempotency_key` dans le reçu clinique Rust.
   L’exécuteur consulte le journal avant d’ajouter un reçu, et la complétion
   backend confirme ensuite le résultat associé au claim.
5. Refuser de réappliquer si SQLite marque l’opération complétée alors que le
   journal Rust ne contient pas le reçu attendu. Après expiration d’un claim
   non complété, la reprise vérifie le journal : si le reçu existe déjà, elle
   réutilise ce résultat; sinon, elle exécute et inscrit l’opération.

## Conséquences

### Positives

- Le commit du claim est le point de linéarisation vis-à-vis d’une révocation
  concurrente sur le même SQLite.
- L’identité opérationnelle et le résultat backend sont persistants et
  tenant-scopés; une répétition terminée ne déclenche pas une nouvelle
  invocation backend.
- Le journal Rust peut reconnaître un reçu déjà écrit après la perte de la
  réponse de complétion et éviter une seconde application dans le parcours
  séquentiel testé par son code.

### Limites et qualification

- SQLite et le JSONL sont deux stores sans transaction commune. Un commit de
  claim et un append de reçu ne sont donc pas atomiques; aucune garantie
  exactly-once entre ces stores n’est revendiquée.
- La lease n’est pas un jeton de fencing vérifié par le journal au moment de
  l’append. Un ancien processus suspendu qui reprend après expiration peut
  chevaucher un claimant de reprise. Le jeton protège la complétion SQLite,
  mais ne neutralise pas à lui seul un append tardif. Une stratégie de fencing
  ou de sérialisation du journal reste à concevoir pour couvrir ce cas.
- Le test Node `npm --prefix backend run test:clinical-authorization` passe
  les cinq scénarios imprimés, dont le claim inter-processus avant révocation,
  le résultat mémorisé après révocation et les portées tenant/mission. Il ne
  compile ni n’exécute le binaire Rust.
- Le CLI E2E avec claim-first, doublon, revoke-first et arrêt avant append est
  présent dans `test_clinical_revocation_rust_cli_e2e.cjs`, mais n’a pas été
  exécuté dans cette qualification : aucun `target\debug` workspace n’existe
  et un build Cargo complet a été différé faute d’espace/incrémentalité
  vérifiable. Le comportement Rust demeure donc non confirmé sur le binaire
  courant.
- Le parcours historique `receipt_bridge` conserve ses limites propres; cette
  décision ne prouve ni un déploiement multi-hôte ni une autorité biologique.

## Alternatives

- Garder uniquement `/validate` avant l’append : rejeté, car une révocation
  peut s’intercaler après la lecture SQLite.
- Garder une transaction SQLite ouverte durant tout l’appel Rust : rejeté,
  car cela bloque la révocation pendant un effet fichier et ne rend pas les
  deux stores atomiques après un crash.
- Promettre une application exactly-once sur la base du claim et de
  l’idempotence : rejeté, car l’expiration de lease et l’append JSONL ne sont
  pas protégés par un protocole atomique ou un fencing commun.
