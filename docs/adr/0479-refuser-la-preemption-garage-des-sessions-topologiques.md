# ADR 0479 — Refuser la préemption Garage des sessions topologiques

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Garage Fabric, capsules et cohérence des topologies.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0472, séparation des preuves d’exécution et de promotion ; ADR 0478, liaison des reçus HTTP au corps.

## Contexte

Une capsule Garage sauvegarde le workspace et le budget d’un worker. Elle ne
capture pas l’état des sessions topologiques persistées. Le thaw pouvait donc
remettre une mission liée à Trinity, Syncytium, Rhizome, Biome ou une autre
topologie en file prête avec un état collectif qui avait changé ou n’avait pas
été suspendu. Les adaptateurs de snapshot existants vérifient une restauration
de workspace dans leurs propres frontières de cycle de vie ; ils ne définissent
pas un protocole générique de continuation d’une session active.

## Décision

Garage refuse le gel avant l’arrêt du runtime si la mission ou les métadonnées du
worker portent une liaison de session topologique reconnue. Le thaw applique le
même contrôle à la capsule et à la demande persistée, afin de bloquer également
les capsules héritées. Une capsule bloquée conserve la phase `frozen`. La
préemption automatique traite ce refus comme une impossibilité de préempter le
candidat et laisse la demande urgente dans la file.

## Conséquences

### Positives

- L’état des fichiers ne peut plus être présenté comme une continuation valide
  d’un état topologique qui n’a pas été capturé.
- Un worker actif n’est pas arrêté avant la détection de sa liaison topologique.
- Une capsule topologique héritée ne peut pas être remise en exécution par thaw.

### Négatives

- Les missions topologiques ne bénéficient pas encore de la préemption Garage.
- Leur reprise exige un contrat de continuation qui lie l’identité, la session,
  les frontières de mutation et les reçus propres à la topologie.

## Alternatives

- Appeler directement `topologySnapshotService.preflightRestore` au thaw :
  rejeté, car les adaptateurs actuels exigent des états quiescents ou terminaux
  et ne modélisent pas la continuation d’une session active.
- Continuer à restaurer le seul workspace : rejeté, car cela peut remettre une
  mission en file malgré la dérive de son état collectif.

## Vérification

`backend/tests/test_garage_runtime_capsules.js` vérifie qu’une liaison Trinity
refuse le gel avant l’arrêt du worker, qu’une capsule liée héritée reste gelée
et que le cycle normal de capsule non topologique fonctionne toujours.
