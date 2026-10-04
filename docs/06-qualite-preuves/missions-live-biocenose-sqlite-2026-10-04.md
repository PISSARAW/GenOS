# Reprise des missions Biocénose avec SQLite — 2026-10-04

- **Statut** : 12 missions réelles exécutées avec le backend complet et une base SQLite persistante.
- **Modèle** : Ollama local `qwen2.5-coder:7b` pour tous les membres.
- **Journal détaillé** : [résultats JSON](biocenose-sqlite-live-results-2026-10-04.json).
- **Base d'essai locale** : `work/biocenose-live-2026-10-04.sqlite` (mode WAL).

## Résultat

Les appels et événements sont maintenant réellement persistés : **766 événements
télémétriques, 549 événements de communautés, 0 erreur de persistance, 0 événement
perdu, file vide après flush**. Le fichier SQLite d'essai contient les douze
communautés. L'initialisation s'est faite en `NODE_ENV=test` dans ce fichier isolé;
aucun compte ou secret n'a été créé dans une base de développement préexistante.

Les états de cycle se répartissent ainsi : **9 `BLOCKED`, 3 cycles `COMPLETED`**.
Ces trois `COMPLETED` ne sont pas trois missions pleinement réussies : deux
communautés ont été escaladées avec résultat `REVIEW_REQUIRED` ou
`INSUFFICIENT_FORECASTS`; la troisième a enregistré une décision, mais réclame
encore des preuves d'indépendance (`independenceMeasured=false`). Aucune des douze
missions n'a satisfait tous les critères de son prompt complexe ni établi une
promotion vérifiée.

| Variant | Résultat du cycle | État / motif décisif |
|---|---|---|
| Epistemic Jury | Bloqué | `collect_belief_revisions` — `BIOCENOSE_BELIEF_UPDATE_INVALID` |
| Delphi Community | Bloqué | `build_argument_graph` — `BIOCENOSE_ARGUMENT_INVALID` |
| Adversarial Assembly | Cycle terminé | `ESCALATED`; `REVIEW_REQUIRED`; prochaine action `CONTINUE_VERIFICATION` |
| Forecasting Crowd | Cycle terminé | `ESCALATED`; `INSUFFICIENT_FORECASTS`; prochaine action `COLLECT_INDEPENDENCE_EVIDENCE` |
| Argumentation Community | Bloqué | `build_argument_graph` — `BIOCENOSE_ARGUMENT_INVALID` |
| Polycentric Council | Bloqué | `build_argument_graph` — `BIOCENOSE_ARGUMENT_INVALID` |
| Byzantine-Resilient Community | Bloqué | `collect_sealed_judgments` — `BIOCENOSE_JUDGMENT_INVALID` |
| Minority-Preserving Jury | Bloqué | `collect_belief_revisions` — `BIOCENOSE_BELIEF_UPDATE_INVALID` |
| Representative Community | Bloqué | `build_argument_graph` — `BIOCENOSE_ARGUMENT_INVALID` |
| Persistent Community | Cycle terminé | État `DECIDED`, mais action `COLLECT_INDEPENDENCE_EVIDENCE`; indépendance non mesurée |
| Human–AI Deliberation | Bloqué | `collect_belief_revisions` — `BIOCENOSE_BELIEF_UPDATE_INVALID` |
| Hybrid Oracle Community | Bloqué | `collect_belief_revisions` — `BIOCENOSE_BELIEF_UPDATE_INVALID` |

La somme des durées d'exécution enregistrées est **1 083,5 s** (environ 18 min
04 s). Representative Community a duré 531,2 s, avec un panel de douze membres
tirés parmi cent profils. Byzantine avait treize membres. Les autres variants
ont utilisé les quotas minimaux (un générateur, un reviewer et un vérificateur,
plus le facilitateur). Ce run réduit ne démontre pas le comportement des
populations de grande taille pour ces variants.

## Interprétation

Cette reprise corrige la lacune du premier essai concernant la persistance, mais
elle ne change pas la conclusion fonctionnelle : le statut runtime
`COMPLETED` peut précéder une escalade et une action demandant davantage de
preuves. Il faut lire ensemble le statut du cycle, celui de la communauté,
l'issue du jugement et `ecologicalDecision.nextAction`.

Les réponses restent celles d'un seul modèle local partagé entre tous les
membres. Pour Byzantine, quatre domaines de fournisseur ont été déclarés dans
les profils, mais les appels réels allaient tous à Ollama et au même modèle :
cela n'est pas une preuve de quatre fault domains indépendants. Le prompt
Persistent décrit vingt missions; cette campagne a exécuté une mission avec ce
variant, pas une série de vingt runs réels. Human–AI n'a reçu aucune décision
humaine, et Hybrid Oracle aucun reçu déterministe injecté. Ces exigences restent
donc non prouvées.

En bref, SQLite confirme maintenant l'exécution et la conservation des traces,
mais **nous n'avons toujours pas un « oui partout » sur les missions réelles**.
