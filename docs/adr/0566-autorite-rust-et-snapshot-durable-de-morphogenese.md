# 0566 — Autorité Rust et snapshot durable de morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Domaine** : orchestration, morphogenèse, sécurité, restauration
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0040, ADR 0324, ADR 0565

## Contexte

Le runtime V2 savait évaluer une proposition de morphogenèse, mais refusait tout
commit de production. Une décision Node ou un snapshot en mémoire ne pouvaient pas
prouver l'identité de l'autorité, survivre à un redémarrage ni remettre en cohérence
les processus, les workspaces, les baux et les budgets après un échec partiel.

## Décision

1. Le backend signe une enveloppe Ed25519 de courte durée avec une clé privée
   configurée par `GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM`. Le binaire Rust n'accepte
   que les clés publiques épinglées dans `GENOS_CLI_AUTHORITY_TRUST_JSON`.
2. La signature lie exactement le principal, le tenant, la mission, le hash du
   plan, l'identifiant et le hash du snapshot, le risque, le mode dégradé, la
   fenêtre de validité et un nonce. Une liaison partielle, expirée ou rejouée sur
   un autre snapshot est refusée.
3. Seul le gate Rust peut retourner `APPLY` et `commitAuthorized: true`. Le reçu
   Rust est de nouveau contrôlé avant la création du commit AgentGit.
4. Une transition de production commence uniquement à une frontière quiescente.
   La présence d'un PID persistant, d'un processus actif ou d'un démarrage en cours
   ferme le gate. Le snapshot capture alors durablement les checkpoints de
   processus quiescents, les workspaces, les baux AgentGit et d'identité, les
   budgets cognitifs et l'état collectif sérialisé.
5. Le manifeste et son hash sont immuables dans SQLite. Les actions sont consignées
   dans un journal append-only. Les états autorisés sont `prepared`, `applying`,
   `committed`, `restoring`, `restored` et `recovery_required`.
6. Le commit AgentGit, la persistance du nouvel état collectif et le passage du
   snapshot à `committed` partagent la même transaction SQLite. Un échec avant ce
   point déclenche les compensations en ordre inverse puis la restauration des
   quatre domaines. Une compensation incomplète place explicitement le snapshot
   en `recovery_required`.

## Conséquences

### Positives

- Un succès de transport ou un callback Node ne peut plus autoriser un commit.
- Le commit est lié cryptographiquement au plan et au snapshot effectivement
  restaurable.
- Un redémarrage conserve le manifeste, le journal, les reçus et l'état de reprise.
- Les tests couvrent le commit authentifié réel, le rollback après échec du commit
  et la restauration effective des quatre domaines.

### Négatives

- Une transition ne peut pas capturer à chaud un processus arbitraire. Il doit
  d'abord atteindre une frontière quiescente et publier son checkpoint durable.
- L'exploitation doit provisionner et faire tourner la paire de clés Ed25519.
- Les snapshots de workspaces consomment du stockage durable et suivent la politique
  de rétention du store de snapshots existant.

## Alternatives

- **Conserver l'état en mémoire** : rejeté, car il disparaît au redémarrage et ne
  restaure aucun effet externe.
- **Faire confiance à une décision Node non signée** : rejeté, car elle ne fournit
  ni provenance cryptographique ni liaison exacte au snapshot.
- **Capturer un processus actif sans barrière** : rejeté, car un PID ou une image
  mémoire ne prouve pas un point de reprise cohérent avec le workspace et les baux.
