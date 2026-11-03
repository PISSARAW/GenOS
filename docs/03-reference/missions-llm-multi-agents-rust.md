# Missions LLM multi-agents et outils dans Rust

Le parcours `genos run --executor rust --agentic-config ...` exécute un DAG
ordonné de deux à quatre agents LLM logiques. Chaque agent a une identité
MORPH, une instruction admise, des dépendances, un dialogue SYNAPSE et une
liste d'outils propres. Les appels et les résultats d'outils passent par les
champs structurés du fournisseur, avec corrélation et journal durable.

Ce profil utilise la feature `native-llm` du runtime. Les parcours
[textuel simple](missions-llm-runtime-rust.md) et
[arithmétique](protocoles-missions-rust.md) gardent leurs configurations
respectives. Le profil agentique ne passe pas par Node ou Thalamus.

## Configuration et lancement

Créer un workspace existant avec `notes.txt` et `agentic.json` :

```json
{
  "schema": "genos.rust-agentic-config/v1",
  "provider": {"kind":"ollama", "address":"127.0.0.1:11434", "model":"qwen2.5:0.5b", "generation":1},
  "generation": {"max_output_tokens":256, "temperature_milli":0},
  "agents": [
    {
      "id":"analyst",
      "instruction":"Appelle read_source avec path notes.txt, puis synthétise le document en deux phrases.",
      "depends_on":[],
      "tools":["read_source"],
      "artifact_names":[],
      "max_turns":3
    },
    {
      "id":"writer",
      "instruction":"Utilise la synthèse reçue. Appelle write_artifact avec name draft et le texte rédigé. Termine avec les sections Sources et Limites.",
      "depends_on":["analyst"],
      "tools":["write_artifact"],
      "artifact_names":["draft"],
      "max_turns":3
    }
  ],
  "documents":["notes.txt"],
  "contract":{"min_bytes":16,"max_bytes":8192,"required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
  "limits":{"tokens":100000,"model_calls":10,"tool_calls":10,"wall_ms":170000},
  "max_input_tokens":4096,
  "turn_timeout_ms":30000
}
```

Le modèle doit être déjà installé et accepter les outils structurés. Cette
configuration n'installe ni ne télécharge de modèle et ne garantit pas que
celui-ci demandera les outils ou respectera le contrat.

```powershell
cargo run -p genos-cli -- run "Rédige une note fidèle au document, avec ses limites." --executor rust --workspace-root D:/work/mission --mission-id 1a7e7870-368c-43f4-9a2e-d7dffcc60bec --agentic-config agentic.json
```

`--agentic-config` est incompatible avec `--llm-config` et
`--native-objectives`. Les options de simulation, TUI ou contrats concurrents
sont refusées avant toute inférence. L'UUID permet une reprise dans un
nouveau processus, sous le même bail, avec les mêmes sources, configuration,
requête et binaire.

## Agents et contexte réellement consommé

Les dépendances doivent désigner des agents précédents. Les doublons,
cycles et graphes dont le dernier agent ne dépend pas transitivement de tous
les autres sont refusés. Chaque agent a entre un et huit tours modèle.
L'ordonnancement est séquentiel dans l'ordre configuré ; les identités et
dialogues sont distincts, sans isolation annoncée par processus. Le
fournisseur et le modèle configurés sont partagés par ce profil.

Avant le premier tour d'un destinataire, GQWF copie et rehashe les résultats
et artefacts de ses dépendances dans un namespace CAS reçu. SYNAPSE
construit ensuite le dialogue à partir de ces copies vérifiées, de la
mission, des instructions admises et du catalogue de sources. Les sources
ne sont pas ajoutées implicitement au texte : `read_source` fournit leurs
octets admis. Les résultats d'outils antérieurs sont relus et corrélés avant
de construire la requête HTTP suivante.

La requête effective lie fournisseur, génération, outils et schémas,
messages, identifiants de corrélation et résultats. Les données reçues d'un
autre agent ou d'un outil ne peuvent pas élargir les permissions.

## Outils installés

| Outil | Arguments | Effet |
| --- | --- | --- |
| `read_source` | `path` | Lit le snapshot d'un document explicitement sélectionné |
| `list_sources` | objet vide | Liste les noms, empreintes et tailles des sources admises |
| `write_artifact` | `name`, `text` | Crée un artefact UTF-8 immuable dans le CAS privé de l'agent |
| `read_artifact` | `agent_id`, `name` | Lit un artefact propre ou une copie reçue d'une dépendance directe |

`write_artifact` exige un nom figurant dans `artifact_names`. Il n'écrase
aucun fichier du workspace. Les arguments inconnus ou mal typés, les chemins
non sélectionnés, noms non autorisés et conflits d'artefact donnent un reçu
`denied` et un résultat d'outil réel. La tentative consomme une unité d'outil.
Une violation d'intégrité, de bail ou de quota arrête le parcours. Un nom
d'outil absent de la requête est refusé par le transport.

Une transaction couvre intention OMEGA, exposition ALLOSTASIE, effet CAS,
reçu et clôture CONTINUITY de chaque outil. Un rejeu valide relit le reçu
original et ne refait ni effet ni débit. Une coupe avant commit annule la
transaction locale entière. Un texte ou un JSON généré dans la prose ne
constitue pas un appel d'outil.

Les documents et la configuration sont limités à 64 KiB par fichier, le
bundle à 1 MiB et la sélection à 16 documents. Les métadonnées Git, GenOS et
les fichiers d'environnement sont exclus. Les traversées, liens et
composants ambigus sont refusés à la lecture. Les arguments d'un appel sont
bornés à 16 KiB ; un artefact d'outil est borné à 64 KiB. Le dialogue effectif
est lui-même borné par le transport ; le runtime arrête une conversation
qui dépasse ses limites.

## Quotas, inconnus et reprise

Les quotas sont globaux à la mission : tokens, appels modèles, tentatives
d'outils et temps observé. Une réserve protégée de 5 %, arrondie au supérieur,
reste indisponible aux effets ordinaires. Les métriques viennent des reçus
du fournisseur ; `max_input_tokens` est une exposition déclarée, sans
tokenizer local garantissant une borne avant l'appel.

L'intention et l'exposition modèle précèdent HTTP. Un permis non duplicable
et un CAS de dispatch empêchent le second envoi. Les réponses connues sont
durables avant leur consommation par les outils ou l'agent suivant. Un
usage partiel conserve le minimum connu et son exposition inconnue ; il
bloque outils, continuation et publication. Une issue HTTP inconnue garde
l'exposition et n'autorise aucun redispatch automatique.

Le budget reste attaché à la mission lors d'une succession ; une nouvelle
incarnation ne recharge pas les consommations. Les effets ou expositions
non résolus bloquent le handoff. La reprise du CLI travaille dans le binding
courant, avec les observations et reçus déjà durables. Elle ne restaure ni
KV cache ni poids du fournisseur. L'expiration ne crée aucune autorité.

## Complétion et preuves

Le rapport `genos.rust-agentic-mission-result/v1` distingue `completed` et
`unresolved`, avec agents terminés, candidat final, quotas et protocoles
journalisés. Après admission, un arrêt laisse les observations et coûts
durables et produit un rapport non complété ; le CLI retourne un code non nul.

Deux méthodes Rust installées du même hôte vérifient le contrat textuel.
EVIDENCE revalide aussi les observations, contextes effectifs, réceptions,
reçus d'outils, clôture du graphe et budget. GQWF transfère source, fermeture
causale et résultat, puis publie tête, reçu OMEGA et statut dans la même
transaction. Un échec transactionnel n'est pas converti en publication.

L'assurance est `artifact_contract_verified`, de portée `artifact_contract`.
`semantic_truth_verified`, `promotable` et `external_effects_authorized`
restent faux. Les appels HTTP et effets CAS expressément admis n'accordent
aucune autorité de déploiement ou d'exécution des instructions produites.
Les obligations sémantiques sans méthode adéquate restent non résolues.

Voir l'[ADR 0781](../adr/0781-missions-llm-multi-agents-et-outils-rust.md),
les frontières des [outils](rust-agentique-outils.md),
de la [preuve](rust-agentique-evidence.md) et de l'[échange](rust-agentique-exchange.md).
