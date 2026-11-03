# Missions LLM multi-agents parallèles dans Rust

Le profil `genos run --executor rust --agentic-config ...` peut exécuter
simultanément des tours d'agents logiques indépendants. Il conserve les
quatre [outils natifs](missions-llm-multi-agents-rust.md), les permissions
admises et les sept protocoles. La sélection est explicite :
`max_parallel_agents` vaut un par défaut ; une valeur supérieure à un active
les vagues parallèles.

## Extension par délégation dynamique

L’option facultative `orchestration` permet au coordinateur de choisir des
tâches pendant la mission pour un pool de workers déjà admis.
Les permissions restent fixes ; les tâches et retours sont copiés et
consommés sous des frontières historiques de tour.

Cette extension dispose d’une [référence distincte](orchestration-dynamique-llm-rust.md)
et d’une [qualification datée](../06-qualite-preuves/orchestration-dynamique-llm-rust-2026-11-03.md).
Sans cette option, le DAG statique décrit ici conserve son comportement.
Les résultats de la qualification dynamique ne sont pas déduits de ceux
du profil parallèle statique.

## Configuration

Le DAG comporte deux à quatre agents. La largeur est comprise entre un et
quatre et ne peut pas dépasser leur nombre. Les dépendances désignent des
agents précédents, et le dernier agent dépend transitivement de tous les
autres. Une chaîne n'offre aucune branche indépendante à paralléliser.

Exemple avec deux lecteurs indépendants et un rédacteur commun :

```json
{
  "schema":"genos.rust-agentic-config/v1",
  "provider":{"kind":"ollama","address":"127.0.0.1:11434","model":"qwen2.5:14b","generation":1},
  "generation":{"max_output_tokens":192,"temperature_milli":0},
  "max_parallel_agents":2,
  "agents":[
    {"id":"reader","instruction":"Appelle read_source pour notes.txt puis résume le fait principal en une phrase.","depends_on":[],"tools":["read_source"],"artifact_names":[],"max_turns":3},
    {"id":"critic","instruction":"Appelle read_source pour notes.txt puis indique une limite en une phrase.","depends_on":[],"tools":["read_source"],"artifact_names":[],"max_turns":3},
    {"id":"writer","instruction":"Utilise les deux résultats reçus. Appelle write_artifact avec name draft. Termine par Sources et Limites.","depends_on":["reader","critic"],"tools":["write_artifact"],"artifact_names":["draft"],"max_turns":3}
  ],
  "documents":["notes.txt"],
  "contract":{"min_bytes":16,"max_bytes":8192,"required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
  "limits":{"tokens":100000,"model_calls":12,"tool_calls":12,"wall_ms":170000},
  "max_input_tokens":8192,
  "turn_timeout_ms":120000
}
```

Le modèle doit être installé et accepter les outils structurés. Le profil
ne télécharge rien. Le transport d'outils requiert au moins une définition
d'outil par agent ; les permissions déclarées ne forcent pas leur invocation.
Les réponses et délais d'un modèle ne sont pas garantis par cet exemple.

```powershell
cargo run -p genos-cli -- run "Rédige une note courte avec ses sources et limites." --executor rust --workspace-root D:/work/mission --mission-id 0bb904b7-a1b4-4e16-a596-643934f456cb --timeout-ms 180000 --agentic-config agentic.json
```

Le profil parallèle exige le journal natif confiné du workspace. Un appel
bibliothèque qui fournit un autre chemin de base est refusé avant HTTP.
Les gardes des documents, de la configuration, du journal et de ses fichiers
WAL restent appliquées lors de l'ouverture par chaque worker.

## Déroulement d'une vague

Le runtime parcourt les agents dans l'ordre de configuration. Il relit les
étapes connues, exécute leurs outils idempotents si nécessaire et sélectionne
au plus un nouveau tour par agent dont les dépendances sont terminées.
GQWF copie et rehashe les résultats des dépendances avant leur consommation.

Une transaction immédiate prépare tous les contextes SYNAPSE, permis OMEGA,
expositions ALLOSTASIE et l'admission de la vague. Un échec de préparation
annule l'ensemble. Le journal impose une seule vague ouverte par incarnation,
y compris entre plusieurs processus concurrents. Le dispatch exige un
membre authentique de cette vague active avant tout HTTP.

Chaque worker utilise un thread et une connexion SQLite propres. Après sa
réponse native, il peut exécuter les outils admis ou terminer son agent.
Le coordinateur rejoint tous les threads lancés, y compris après erreur ou
panique. La vague suivante attend leur jointure ; il ne s'agit pas d'un
ordonnanceur réactif lançant un nouveau tour pendant qu'un frère reste actif.

## Budget partagé

La largeur réelle dépend des agents prêts, des appels encore disponibles,
de l'exposition maximale en tokens et du temps ordinaire restant. La réserve
protégée de cinq pour cent demeure indisponible aux effets ordinaires.

Pour une vague de largeur `n`, chaque fenêtre est bornée par le minimum du
plafond de tour, du temps ordinaire disponible divisé par `n` et du bail
restant. Chaque contexte et allocation sont persistés avant HTTP. La
réservation et le règlement sont globaux à la mission.

Le quota de temps mesure la somme des durées observées des opérations,
attentes du fournisseur comprises. Deux HTTP de deux secondes consomment
environ quatre secondes de ce quota, même s'ils se chevauchent. Le bail
borne séparément la durée écoulée de l'incarnation. Le parallélisme ne
recharge ni la réserve ni les autres quotas.

## Échecs et reprise

Une erreur de membre arrête les nouvelles vagues de l'invocation, après
jointure de tous les workers déjà lancés. Les observations et effets privés
réellement terminés restent durables. Une issue inconnue conserve son
exposition ; aucune nouvelle invocation ne recrée son permis.

Avant de réconcilier une vague interrompue, la reprise exige toutes ses
observations natives connues avec usage connu. Elle peut ensuite terminer
les outils ou complétions manquants, puis fermer la vague. Un arrêt suivi
d'une clôture réelle ajoute un reçu de récupération relié à l'historique.
Une vague ouverte interdit la succession CONTINUITY et la publication.

EVIDENCE relit les descriptions, membres et chaînes de reçus en les liant
aux événements originaux. Changer un timestamp puis recalculer un hash ne
crée pas une preuve de préparation ou de jointure. Les observations doivent
être couvertes exactement par les vagues jointes avant la publication GQWF.

## Rapport et portée

Le rapport conserve le schéma `genos.rust-agentic-mission-result/v1` et ajoute :

| Champ | Sens |
| --- | --- |
| `max_parallel_agents` | Largeur maximale admise dans la configuration |
| `parallelism.waves_prepared` | Nouvelles vagues préparées par cette invocation |
| `parallelism.peak_active_step_workers` | Pic des workers de tours actifs de cette invocation |

Le rejeu d'une publication déjà vérifiée produit zéro nouvelle vague et
zéro nouveau worker. Ces métriques ne décrivent pas l'historique entier de
la mission ni le nombre de générations calculées simultanément par le
fournisseur. Celui-ci peut sérialiser le calcul malgré des HTTP simultanés.

Les agents partagent le même hôte et le même fournisseur configuré. Les
effets SQLite sont sérialisés par les transactions. L'assurance finale
reste `artifact_contract_verified` ; `semantic_truth_verified`, `promotable`
et `external_effects_authorized` restent faux. Une réponse de transport,
un pic de threads ou un accord entre agents ne prouve pas une vérité générale.

Voir l'[ADR 0785](../adr/0785-missions-llm-paralleles-et-outils-rust.md) et
le [contrat du journal parallèle](rust-agentique-journal-parallele.md).
