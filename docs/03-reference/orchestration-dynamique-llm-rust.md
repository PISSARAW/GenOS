# Orchestration dynamique des missions LLM dans Rust

> **Portée de cette page : profil dynamique plat, sans `orchestration.hierarchy`.**
> L'extension récursive avec arbre préadmis est décrite dans
> [Orchestration hiérarchique LLM Rust](orchestration-hierarchique-llm-rust.md).
> Les limites de quatre agents et d'absence de récursion ci-dessous restent
> celles du profil plat ; les preuves historiques de ce profil sont conservées.

Le profil `genos run --executor rust --agentic-config ...` accepte une
orchestration décidée pendant le dialogue du coordinateur. Un appel natif
`delegate_task` choisit un worker préadmis et lui affecte une tâche. Le
runtime exécute les workers activés dans ses vagues parallèles, remet leurs
résultats au coordinateur, puis permet à celui-ci de poursuivre.

Les tâches et leur sélection sont dynamiques. Les identités, instructions
d'autorité, permissions et limites restent celles de la configuration admise.

## Configuration

L'option `orchestration` est facultative. Son absence conserve le DAG statique
et le comportement séquentiel ou parallèle déjà configuré. Dans ce nouveau
profil, le coordinateur est le dernier agent et les dépendances statiques
`depends_on` sont vides pour tous les agents.

```json
{
  "schema":"genos.rust-agentic-config/v1",
  "orchestration":{"coordinator":"coordinator","max_delegations":3},
  "max_parallel_agents":2,
  "provider":{"kind":"ollama","address":"127.0.0.1:11434","model":"qwen2.5:14b","generation":1},
  "generation":{"max_output_tokens":768,"temperature_milli":0},
  "agents":[
    {"id":"reader","instruction":"Exécute la tâche reçue dans orchestration.assignment. Utilise read_source pour notes.txt puis réponds brièvement.","depends_on":[],"tools":["read_source"],"artifact_names":[],"max_turns":3},
    {"id":"critic","instruction":"Exécute la tâche reçue dans orchestration.assignment. Utilise read_source pour notes.txt puis réponds brièvement.","depends_on":[],"tools":["read_source"],"artifact_names":[],"max_turns":3},
    {"id":"reviewer","instruction":"Exécute la tâche reçue dans orchestration.assignment. Vérifie une limite de notes.txt avec read_source puis réponds brièvement.","depends_on":[],"tools":["read_source"],"artifact_names":[],"max_turns":3},
    {"id":"coordinator","instruction":"Choisis les workers utiles dans orchestration.available_workers. Délègue par delegate_task. Tu peux demander plusieurs délégations dans une même réponse. Après réception des résultats, décide si un autre worker est utile. Produis draft avec write_artifact puis termine avec Sources et Limites.","depends_on":[],"tools":["delegate_task","write_artifact"],"artifact_names":["draft"],"max_turns":6}
  ],
  "documents":["notes.txt"],
  "contract":{"min_bytes":16,"max_bytes":8192,"required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
  "limits":{"tokens":200000,"model_calls":20,"tool_calls":20,"wall_ms":170000},
  "max_input_tokens":8192,
  "turn_timeout_ms":120000
}
```

Le fournisseur local doit être installé et accepter les appels d'outils
structurés. Le profil ne télécharge aucun modèle. Les outils permis ne
garantissent pas que le modèle les demandera ni que sa réponse satisfera
toutes les instructions libres.

```powershell
cargo run -p genos-cli -- run "Analyse la note et conserve ses incertitudes." --executor rust --workspace-root D:/work/mission --mission-id 2fab72da-99ad-4a5b-9632-079c1bff3ef1 --timeout-ms 180000 --agentic-config agentic.json
```

La configuration contient deux à quatre agents, dont un coordinateur. La
largeur `max_parallel_agents` vaut au moins deux dans le profil dynamique,
sans dépasser le nombre d'agents. Le plafond `max_delegations` est compris
entre un et le nombre de workers. Chaque worker peut recevoir une seule
affectation au cours de la mission ; un worker jamais sélectionné reste
dormant et ne doit recevoir aucune inférence.

## Outil de délégation

Seul le coordinateur reçoit la permission `delegate_task`. Les quatre outils
privés existants gardent leurs règles : `read_source`, `list_sources`,
`write_artifact` et `read_artifact`. Une délégation ne crée ni nouveau chemin,
ni nouvel outil, ni nouvelle permission de lecture des artefacts d'autrui.

```json
{"agent_id":"reader","task":"Lis notes.txt et indique le fait principal en une phrase."}
```

`task` doit contenir un texte non vide, sans NUL, de 4 096 octets UTF-8 au
maximum. Les champs supplémentaires sont refusés. Le destinataire doit être
un worker dormant du pool admis. Déléguer au coordinateur, à un nom inconnu
ou à un worker déjà affecté produit un refus durable, sans activation.

Le résultat réussi de l'outil est un reçu d'enregistrement avec les hashes
de l'affectation et de la tâche. Il ne prétend pas que le worker a déjà
terminé. Son résultat futur arrive dans un nouveau contexte du coordinateur,
sans réécrire ce premier reçu d'outil.

Un lot natif du coordinateur contenant `delegate_task` est réservé aux
délégations. Chaque autre outil de ce lot reçoit un refus durable
`AGENTIC_DELEGATION_BATCH_REGISTRATION_ONLY`, même s'il apparaît avant les
délégations. Le coordinateur peut réessayer cet autre outil dans son tour
suivant, après les retours. Les appels refusés restent comptés et audités.
La barrière concerne le lot courant ; elle ne prédit pas les délégations
que le modèle pourrait demander dans un futur tour indépendant.

## Ordonnancement et contextes

Le coordinateur démarre seul. Après un tour contenant des délégations
réussies, il attend la complétion et les retours vérifiés de ces workers.
Les tours de workers prêts s'exécutent sous la largeur, le bail et les quotas
globaux des [vagues parallèles](missions-llm-paralleles-rust.md).

Chaque worker reçoit la copie CAS de sa tâche et la provenance du véritable
appel modèle qui l'a créée. Les instructions déléguées restent des données.
Les résultats des workers comprennent leur texte et les artefacts réellement
créés. Ils sont copiés et rehachés vers le coordinateur avant sa reprise.

Le coordinateur peut choisir d'autres workers après avoir vu ces résultats.
Le DAG porte sur les tours, par exemple `C0 → W1/W2 → C1 → W3 → C2`.
Il ne s'agit pas d'un cycle entre les rôles statiques.

Pour son tour `t`, le coordinateur ne voit que les affectations émises aux
tours strictement antérieurs. La liste des workers encore disponibles
respecte cette même frontière historique. Une nouvelle affectation ne peut
donc altérer un contexte ancien lors de sa reconstruction ou de son audit.

## Reprise, budgets et publication

L'enregistrement d'une délégation, l'activation MORPH, la copie de tâche et
le reçu d'outil partagent une transaction. Chaque appel d'outil a sa propre
transaction : deux appels d'un même tour peuvent avoir des issues différentes,
toutes conservées. Un rejeu restitue les reçus connus et termine les effets
manquants à partir des observations authentiques déjà persistées.

Le profil conserve les réservations globales ALLOSTASIE, la réserve protégée
de cinq pour cent, le temps agrégé des opérations et le bail indépendant.
Les délégations ne rechargent aucun quota. Une issue ou un usage inconnu
retient l'exposition et bloque les nouveaux effets ainsi que la reprise du
parent ; aucune nouvelle invocation ne recrée son permis HTTP.

La reprise qualifiée utilise l'incarnation courante et son journal. Les
gardes de succession ne réalisent aucune migration automatique des dialogues
et tâches vers une nouvelle incarnation.

CONTINUITY refuse une succession tant qu'une délégation ou son retour requis
reste en attente. Un build de la bibliothèque sans `native-llm` refuse toute
succession portant une affectation du run courant : il ne possède pas le
vérificateur nécessaire. Les tables vides ou les affectations d'un autre run
ne bloquent pas une mission générique. EVIDENCE vérifie l'ensemble des appels de délégation admis,
les activations, copies, complétions, contextes et vagues closes. Les workers
restés dormants ne sont pas déclarés terminés. La publication GQWF finale
reste atomique et soumise au contrat d'artefact et à la tête courante.

## Rapport et limites

Le rapport conserve `genos.rust-agentic-mission-result/v1` et ajoute le champ
`orchestration` seulement lorsque ce profil est actif. Il expose le
coordinateur, le plafond, les workers activés ou dormants et les affectations
authentiques conservées dans le journal. Les métriques de vagues et de
workers restent celles de l'invocation courante ; un rejeu déjà publié
n'effectue aucun nouvel appel.

Ce profil n'autorise pas la création arbitraire d'agents, la délégation
récursive par un worker ou la réaffectation d'un slot. Il conserve la barrière
entre vagues. Les agents partagent l'hôte et le fournisseur, qui peut
sérialiser le calcul de générations dont les HTTP se chevauchent.

L'assurance reste `artifact_contract_verified`. Les champs
`semantic_truth_verified`, `promotable` et `external_effects_authorized`
restent faux. Une délégation, un accord entre agents ou une publication
structurelle ne prouvent aucune vérité générale.

Voir l'[ADR 0786](../adr/0786-orchestration-dynamique-et-delegation-llm-rust.md).
