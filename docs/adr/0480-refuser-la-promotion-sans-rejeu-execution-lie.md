# ADR 0480 — Refuser la promotion sans rejeu d’exécution lié au run

- **Statut** : Accepté et implémenté pour le refus ; producteur de reçu à réaliser.
- **Date** : 2026-10-14
- **Domaine** : Exécution de stratégie, rejeu déterministe et promotion.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0472, séparation des preuves d’exécution et de promotion ; ADR 0476, limites des gates de preuve Trinity.

## Contexte

Les contrats reproductibles et à haut risque activent `require_replay`. La gate
exige un reçu vérifié lié au run, à l’agent et à un snapshot dont le digest est
cohérent. Les primitives actuelles peuvent rejouer certaines trajectoires,
restaurer un état ou vérifier l’intégrité d’événements, mais elles ne relancent
pas le run de stratégie complet. Aucun producteur ne persiste donc le reçu
attendu.

Un double lancement d’une commande de test depuis un snapshot démontrerait la
reproductibilité de cette commande dans les limites de son environnement. Il ne
rejouerait ni les entrées du modèle et des outils, ni les décisions, ni les effets
du run. De plus, le contrat de stratégie ne lie pas encore durablement une
commande de vérification, un runner versionné et ses dépendances au run.

## Décision

Maintenir la gate `require_replay` fermée en l’absence de reçu émis côté serveur.
Les champs fournis par l’appelant, les statuts de succès, une reconstruction de
trajectoire et un hash d’événements ne satisfont pas cette politique. Un échec
ou une omission d’une primitive de la phase `diff_and_replay` ne peut pas être
enregistré comme phase réussie.

Un futur producteur devra rejouer le comportement du run à partir d’entrées
persistées et scellées, dans un environnement isolé, avec versions de runner,
primitives, outils et dépendances, budget et graines identifiés. Il devra
persister un reçu durable lié au `runId`, à l’agent, au snapshot et à son digest.
Le digest du reçu devra être inclus dans le payload d’approbation humaine. Une
preuve de commande de test pourra compléter cette preuve, mais ne la remplacera
pas.

## Conséquences

### Positives

- Une reconstruction ou une trace intègre ne peut pas être présentée comme une
  exécution déterministe.
- Les contrats reproductibles et à haut risque échouent fermés avant promotion.
- La frontière de preuve requise pour un futur producteur est explicite.

### Négatives

- Les runs concernés peuvent atteindre `awaiting_approval`, mais leur promotion
  est impossible tant que le producteur de reçu n’existe pas.
- La capacité de promotion par rejeu d’exécution est conceptuelle pour ces runs,
  même si des primitives de replay plus limitées sont disponibles.

## Alternatives

- Accepter `replayVerified`, `diffAndReplayPassed` ou un reçu transmis par
  l’appelant : rejeté, car ces valeurs ne prouvent pas une exécution serveur
  liée au run.
- Compter deux exécutions identiques d’une commande de test comme rejeu du run :
  rejeté, car elles ne reproduisent pas les entrées et effets du runtime d’agent.
- Désactiver `require_replay` pour permettre les promotions : rejeté, car cela
  supprimerait silencieusement la garantie demandée par le contrat.

## Vérification

`node backend/tests/test_promotion_gate.js` passe et vérifie que l’absence de
reçu bloque la promotion. `node backend/tests/test_strategy_promotion_policies.js`
confirme son premier contrôle replay, puis échoue dans un contrôle de conservation
de branches, car Windows refuse `realpath` sur son workspace temporaire
(`EPERM`). `node backend/tests/test_strategy_replay_stage_wiring.js` passe et
vérifie que la phase de rejeu échoue si l’une de ses deux opérations manque et
que les trajectoires inexécutables ne sont pas présentées comme reproduites.
