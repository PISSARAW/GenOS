# Coopération LLM : sortie typée du daemon et relance réelle

- **Statut** : contrat de sortie validé ; qualification réelle négative.
- **Date** : 2026-11-04.
- **Correctif exécuté** : `bc2101c935d8a35d0ebd778cb4ef21cf435fc525`.
- **Contrat** : [guide](../02-orchestration/contrat-sortie-daemon-allocation.md),
  [ADR 0795](../adr/0795-observation-daemon-structuree.md).
- **Comparaison historique** : [relance précédente](cooperation-llm-constat-daemon-2026-11-04.md),
  dont les sorties étaient mal formées.

## Correctif et validation

Le daemon d'allocation reçoit désormais un schéma fournisseur métier :
`genos.daemon-allocation-observation/v1`. Il produit un objet `observation` typé,
ou une abstention explicite. Le runtime valide strictement cette réponse et
sérialise les valeurs inchangées dans un unique claim interne. Il ne calcule
aucune somme et n'injecte aucune réponse attendue dans le schéma.

Le texte brut est conservé dans le reçu et dans le journal des tours du modèle.
Son empreinte `sourceTextSha256` relie la projection au texte original. Les
oracles existants restent obligatoires pour vérifier un constat réussi.

Les contrôles ciblés passent depuis l'arbre gelé
`ed8449eea7fb4300e2c115b26ff78e3ac53d694a`, sur D: :

- contrat du daemon : types, sources, format ancien, propriétés étrangères,
  abstention, sérialisation et empreinte ;
- veto des deux méthodes natives sur une observation structurée mais fausse ;
- compatibilité des schémas génériques et contrat du planificateur ;
- cinq scénarios à transport HTTP contrôlé : réparation complète, arrêt sain,
  faux positif refusé, plan mal ordonné refusé et abstention avec fermeture.

Le scénario contrôlé de réparation termine ses quatre workers distincts et
huit exécutions d'oracle, sans promotion source. Ces générations prédéfinies ne
constituent pas une qualification du vrai LLM.

Un premier passage du fixture a échoué par masquage de la variable `request`.
Le fixture a été corrigé, les journaux de l'échec ont été conservés et les cinq
scénarios ont été rejoués sur une nouvelle copie gelée, avec succès.

Le contrôle qualité ciblé final passe sur neuf fichiers source. La passe globale
exécutée est également verte. Les autres contrôles globaux ne sont pas verts :

- `npm test` a été tenté deux fois ; le préflight refuse le démarrage car une
  autre suite détient le verrou exclusif, avec les PID 37168 puis 38824 ;
- `cargo test --workspace -- --test-threads=1` échoue dans
  `same_initial_state_and_seed_reproduce_identical_lineage_after_cli_restarts`,
  au contrôle d'égalité du croisement biologique, hors des fichiers du correctif.

Les journaux exacts sont conservés. L'origine du défaut Rust n'a pas été isolée
dans ce travail ; le verrou d'une autre suite n'a pas été supprimé.

## Protocole réel et provenance

Les deux cas utilisent une extraction du commit corrigé sur D:, sans modification
du code après commit, deux bases SQLite neuves et un serveur Ollama dédié.
Le lanceur exclut les variables de test et les clés de fournisseurs externes,
désactive le chargement de `.env` et fixe explicitement l'endpoint local.

- Exécutable : `D:\ollama\ollama.exe`, version `0.40.12`.
- Modèle : `qwen2.5-coder:7b`, Q4_K_M, 7,6 milliards de paramètres.
- Digest : `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
- Endpoint : `http://127.0.0.1:11467/api/chat`.
- Réserve GPU configurée : 1 073 741 824 octets ; un appel parallèle au maximum.
- Racine locale : `D:\GenOS-runs\daemon-output-20261104-123627\real`.

Cette racine contient `provenance.json`, configurations, commandes et empreinte
du binaire Rust préconstruit dans `*.execution.json`, `incident/report.json`,
`healthy/report.json`, les journaux et les preuves de test dans `checks/`.
`audit.cjs` relit les bases en lecture seule et produit `analysis-evidence.json`.
`RESULTAT.json`, `ANALYSE.md` et le manifeste SHA256 conservent le bilan local.
Les secrets privés et les bases ne sont pas committés.

## Résultats réels

Les valeurs sont `[4,9,6,3,8]`, la cible 17 et les indices depuis zéro.

| Mesure | Allocation incorrecte | Allocation saine |
| --- | --- | --- |
| Indices observés | `[0,1]` | `[1,4]` |
| Constat attendu | somme 13, anomalie vraie | somme 17, anomalie fausse |
| Début UTC du rapport | 12:57:45.317 | 13:00:49.140 |
| Durée du pilote après initialisation de la base | 140 069 ms | 102 575 ms |
| Réponse du modèle | `unresolved`, observation nulle | somme 13, cible 17, anomalie fausse |
| Format métier valide | oui, branche d'abstention | oui, branche d'observation |
| Tokens d'entrée / sortie | 3 506 / 109 | 3 509 / 392 |
| Total modèle | 3 615 | 3 901 |
| Appels au planificateur | 0 | 0 |
| Processus d'oracle | 0 | 2 |
| Verdict / code de sortie | refus / 1 | refus / 1 |

Les runs du daemon sont `strategy_run_1793797097106_64f97fec` et
`strategy_run_1793797255431_d68d4ee6`.

### Allocation incorrecte : abstention sur le mauvais périmètre

Le modèle renvoie un JSON conforme à la branche `unresolved`, avec une observation
nulle. Son incertitude concerne les métriques internes de « dissonance » et de
« cohérence » présentées dans son contexte. Il ne traite pas l'allocation fournie.

L'abstention ne crée aucun claim. La barrière arrête le worker pour preuves
insuffisantes, avant les oracles et avant le planificateur. Ce résultat montre
une confusion du périmètre de la tâche dans cette réponse ; il ne démontre pas
que les données arithmétiques étaient absentes ou insuffisantes.

### Allocation saine : forme correcte, somme fausse

Le modèle produit cet objet :

```json
{"observedSum":13,"target":17,"anomaly":false}
```

La projection conserve exactement ces valeurs. Le booléen correspond au cas
sain, mais la somme annoncée est fausse et contredit sa propre comparaison à 17.
Les deux processus natifs, `source_recompute` et `cross_check`, terminent
normalement et rendent `refuted`, raison `workspace_postcondition_false`.
L'assemblée est donc refusée avec `ORACLE_ASSEMBLY_NOT_ACCEPTED`.

Contrairement à la relance précédente, le refus ne porte plus sur le nombre de
claims ou sur une chaîne non JSON. Il porte sur la vérité de l'observation.
Un `outcome: success` du modèle ne suffit toujours pas à accepter un constat.

## Contexte, autorité et ressources

L'audit confirme, dans les deux cas :

- présence du problème et de l'allocation attendus dans le prompt enregistré ;
- absence de l'allocation de l'autre cas dans ce prompt ;
- identité du texte brut dans le reçu et le journal du modèle, avec SHA256 correct ;
- conservation exacte de l'observation lors de la sérialisation ;
- sources inchangées, zéro run `planned/running` et zéro récupération
  `queued/claimed/retry` après fermeture.

Ces éléments n'indiquent pas une perte des données source. L'abstention montre
que le modèle s'est attaché à des métadonnées de contexte. L'influence précise
des couches d'identité, d'ADN et de mémoire reste une hypothèse à tester avec
une expérience distincte ; aucun mécanisme de contamination entre les deux cas
n'est établi par la somme 13 produite dans le cas sain.

Les deux daemons restent sans droits d'écriture, de délégation ou de promotion.
Aucun plan n'est accepté. Aucun spécialiste, vérificateur worker ou worker de
récupération n'est lancé. `qualified`, `protocolCompleted`, `promoted` et
`genosMissionQualified` restent faux. Les identités racines conservent une
projection `agents.status: running`, déjà visible dans la relance précédente ;
l'audit constate néanmoins zéro run actif et les processus de qualification sont
terminés. Ce champ n'est pas présenté comme une preuve de complétion.

Le total est de **7 516 tokens**, deux appels réels au modèle, zéro token de
planification et deux processus d'oracle pour 3 466 ms cumulées. Les comptes du
fournisseur et des rapports concordent pour toutes les tentatives. Le plafond
reste 68 096 tokens par cas. L'abstention évite des étapes ultérieures ; cette
baisse de travail ne prouve pas une meilleure efficacité de coopération.

La télémétrie fournisseur déclare 0 USD local. Le coût matériel, l'électricité
et le pic mémoire ne sont pas mesurés. Une observation du serveur chargé indique
5 635 173 252 octets de VRAM, un contexte de 16 384 tokens et 29/29 couches
déportées sur le GPU. Il n'y a pas d'échec de chargement ou de dépassement mémoire
constaté dans ces deux runs.

Le serveur dédié et ses descendants, PID 24504, 36480 et 2760, sont arrêtés.
Le contrôle à 13:03:10 UTC confirme leur absence et l'absence de listener sur
le port 11467. Aucun autre serveur n'a été arrêté.

## Conclusion

Le contrat structuré élimine le défaut de forme observé et conserve le veto
sémantique indépendant. Le vrai modèle n'a toutefois pas produit de constat
admissible dans ces deux runs : abstention hors du périmètre, puis somme fausse.
Le planificateur corrigé n'a donc toujours pas été exercé ici par le vrai LLM.
La décomposition, la solution et la restauration restent non qualifiées en réel.

La prochaine investigation doit porter sur le cadrage du contexte du daemon et
sur son calcul des valeurs sélectionnées. Elle devra garder l'abstention et les
oracles, sans injecter les résultats attendus ni transformer les réponses fausses
en observations acceptées.
