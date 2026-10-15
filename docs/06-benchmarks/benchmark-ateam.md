# Protocole de benchmark A-Team

`benchmarks/ateam/benchmarkRunner.cjs` exécute un même ensemble de scénarios sur cinq
bras : spécialiste solo, équipe parallèle sans graphe, A-Team sans handoffs, A-Team sans
réparation, et A-Team complète. L'ordre des bras varie de façon déterministe par scénario
et répétition. Les comparaisons sont appariées par scénario et répétition.

## Adaptateur d'exécution

`runBenchmark({ scenarios, repetitions, executeCase })` délègue chaque essai à un
adaptateur réel. Celui-ci reçoit le scénario, la définition du bras, la répétition et une
graine stable. Il retourne `succeeded`, `evidenceValid`, `elapsedMs` et `tokenCost`.
Une réussite n'est comptée que si le travail a réussi et que sa preuve est valide. Une
preuve invalide est rapportée séparément ; elle ne peut pas améliorer le taux de succès.

Le rapport contient les mesures par bras et les deltas appariés face au bras solo. Le
harnais ne fabrique ni résultats d'agents ni preuves et n'exécute aucun fournisseur lui-même.
Les résultats ne sont scientifiquement interprétables que si l'adaptateur lance les vrais
workers, applique les politiques annoncées, utilise les mêmes limites de budget et critères
sur chaque bras, et conserve les reçus bruts avec le rapport.

## Limites actuelles

Le dépôt fournit le protocole et son test contractuel, pas encore un adaptateur de campagne
connecté aux workers A-Team. Le test du harnais vérifie l'appariement et le gate de preuve ;
il ne constitue pas un résultat de performance. Toute comparaison publiée doit inclure
les données brutes, le nombre de scénarios/répétitions et les versions des modèles.

## Portée des nouvelles preuves de clôture

`test_ateam_execution_e2e.js` exerce SQLite et des sous-processus Node : promotion, refus, délais, baux et handoffs. Les 44 cas de variantes sont des tests de contrats isolés. Ils ne sont pas les essais des cinq bras de ce protocole, ni une mesure de gain de temps, de coût ou de qualité. Le bras « A-Team complète » désigne une configuration expérimentale cible, pas une certification de conformité à toute la fiche. Voir [Référence du runtime A-Team](../03-reference/runtime-a-team.md).

## Validation de l'identité sociale des workers A-Team — 2026-10-15

- **Statut** : résultat empirique local ; comportement observé et tests associés réussis.
- **Portée** : runtime A-Team Node, exécuteur Codex, organisation dynamique,
  communications persistées et audit terminal.
- **Dernière revue** : 2026-10-15.

### Question testée

Un worker GenOS peut-il identifier qui il est, reconnaître les autres workers de sa
mission, décrire sa relation avec eux et laisser une trace complète de leurs échanges ?

Le terme **identité** désigne ici une identité opérationnelle fournie par le runtime :
identifiant stable dans la mission, rôle, sous-système, liens de communication et
provenance des rapports. Cette expérience ne teste pas une conscience de soi.

### Protocole

Une mission A-Team réelle a été lancée avec l'exécuteur `codex` et trois rôles
complémentaires :

1. `identity_witness` devait restituer sa propre identité et les éléments reçus du runtime ;
2. `peer_mapper` devait établir la carte des pairs ;
3. `relationship_analyst` devait caractériser les relations et vérifier les échanges.

Chaque worker devait :

- lire son état d'organisation ;
- trouver ses liens `peer` ;
- publier une question directe et une preuve partagée ;
- recevoir au moins un message d'un autre worker ;
- acquitter les messages reçus ;
- répondre à un message en conservant `inReplyTo` ;
- rendre un rapport avec claims, preuves, tests et critères d'acceptation sourcés.

Les critères globaux exigeaient la contribution promue des trois workers. Un succès de
processus, un statut `completed` ou un message sans preuve ne suffisait pas.

### Identifiants du run observé

| Objet | Identifiant |
|---|---|
| Mission orchestrateur | `mcp_orchestrator_social_identity_20261015_x` |
| TeamRun A-Team | `ateam_2b1d3e404601f956d618683a2ed4ee63` |
| Worker témoin d'identité | `worker_3b45792eea1450629fce5f419dd8734d` |
| Worker cartographe des pairs | `worker_41457cbbdd583f62cec92da1d8036b72` |
| Worker analyste des relations | `worker_8de8f7d0e9d00394fcdbe101aaa01a8e` |

### Résultats

Le TeamRun a terminé avec `status: COMPLETED`, `accepted: true`,
`audit.complete: true` et `audit.errors: []`.

#### Identités et relations

Les trois entrées de `audit.identities` contenaient le `workerId`, le `memberId`, le
rôle et le sous-système attendus. Chaque worker disposait de deux liens vers ses deux
pairs, avec une relation `peer` et une communication directe sur `peer_mesh`.

Cette observation répond positivement à la question testée dans les limites du contrat :
chaque worker a reçu sa propre identité opérationnelle et la carte complète des deux
autres membres de cette mission.

#### Communications

Neuf messages persistants ont été relus dans l'ordre, identifiants 189 à 197 :

| Type | Nombre | Propriété vérifiée |
|---|---:|---|
| question directe | 3 | émetteur et destinataire explicites |
| partage de preuve | 3 | diffusion dans l'organisation de mission |
| réponse | 3 | lien `inReplyTo` conservé |

Les reçus associés conservaient les transitions de disponibilité, lecture et
acquittement. L'audit terminal exposait pour chaque message l'émetteur, le destinataire,
le canal, le type, la livraison, le signal décodé et les reçus.

#### Preuves et couverture

Les trois rapports ont été promus. Les quatre mesures de couverture étaient complètes :

| Mesure | Résultat |
|---|---:|
| `missionCoverage` | 3/3 |
| `staffedCoverage` | 3/3 |
| `runtimeToolCoverage` | 3/3 |
| `verifiedCoverage` | 3/3 |

Les contributions couvraient l'identité, la cartographie des pairs, les relations et
les communications. Les références citées par les critères d'acceptation figuraient
également dans les claims ou les tests réussis correspondants.

### Échecs rencontrés et corrections

Les premiers runs ont révélé plusieurs défauts distincts. Chacun a été corrigé dans un
commit séparé :

| Commit | Défaut corrigé |
|---|---|
| `5fbbe9a2` | preuve terminale susceptible d'être perdue avant la clôture |
| `322978ef` | télémétrie non vidée avant l'arrêt du processus |
| `7c0734e9` | statut achevé d'un worker écrasé pendant l'agrégation |
| `3e02e4df` | dossier A-Team non récupéré depuis le journal durable |
| `6917e0a2` | preuve télémétrique persistée trop tard dans la file |
| `646b7bd3` | critères canoniques absents de certains rapports |
| `7bedb3c7` | bootstrap ne conservant que les identifiants de messages |
| `5bc94c17` | contributions locales prouvées non agrégées au niveau équipe |
| `50525633` | règle de backing des `evidenceRefs` absente du prompt |
| `1f94f97a` | absence d'audit terminal unifié des identités et échanges |
| `aaa95959` | livraison en double aux listeners de télémétrie |

Les runs intermédiaires sont restés bloqués lorsque les workers refusaient à juste titre
de transformer leur observation locale en affirmation globale, puis lorsqu'une référence
de critère ne figurait pas dans les preuves du claim ou du test. Le run final a réussi
après ajout de l'agrégation bornée et de la règle explicite de référencement.

### Vérifications logicielles

Les contrôles suivants ont réussi après les corrections :

```text
node backend/tests/test_worker_coordination_bootstrap.js
node backend/tests/test_ateam_mission_criterion_prompt.js
node backend/tests/test_ateam_execution_e2e.js
node backend/tests/test_ateam_runtime.js
node backend/tests/test_ateam_team_audit.js
node backend/tests/test_telemetry_contract.js
node backend/tests/test_telemetry_persistence_priority.js
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Le contrôle de qualité a examiné 6 285 fichiers : 14 violations historiques et aucune
nouvelle violation.

### Interprétation

Le résultat établit qu'un worker A-Team peut connaître une identité opérationnelle
scopée par sa mission et utiliser une représentation explicite de ses pairs. Il peut
aussi produire des communications corrélées dont la livraison et l'acquittement sont
auditables après la clôture.

Le résultat ne démontre pas :

- une conscience phénoménale ou une compréhension humaine de l'identité ;
- la conservation automatique de cette connaissance dans une mission future ;
- la vérité des contenus échangés ;
- l'indépendance cognitive des workers, tous utilisant ici la même famille d'exécuteur ;
- une garantie distribuée si la base persistante devient indisponible.

`audit.complete` signifie que toutes les lectures prévues par l'audit ont réussi. La
promotion des rapports et les gates de preuve restent nécessaires pour établir que les
contributions satisfont les critères de la mission.

### Sources

- [Contrat du runtime A-Team](../03-reference/runtime-a-team.md).
- [Audit terminal](../../backend/src/services/aTeam/execution/teamAuditService.js).
- [Bootstrap de coordination](../../backend/bin/worker-coordination-bootstrap.cjs).
- [Agrégation des preuves](../../backend/src/services/aTeam/execution/teamEvidenceService.js).
- [Test de l'audit](../../backend/tests/test_ateam_team_audit.js).
- [Test du bootstrap](../../backend/tests/test_worker_coordination_bootstrap.js).
