# Missions LLM dans le runtime Rust

Le parcours `genos run --executor rust --llm-config ...` génère un artefact
textuel par un appel HTTP Rust explicite, puis vérifie son contrat et publie
ses objets dans le CAS local. Les sept protocoles sont obligatoires. Le CLI
active la feature Rust `native-llm`, qui dépend de `api` ; une bibliothèque qui
utilise ce parcours doit activer cette feature explicitement.

Ce parcours ne passe pas par Node, le cache Thalamus ou `GENOS_MOCK_LLM`.
Il conserve le profil [integer_sum](protocoles-missions-rust.md), sélectionné
séparément par `--native-objectives`.

## Configurer une mission

Créer un workspace existant avec `notes.txt` et ce fichier UTF-8
`mission-llm.json` :

```json
{
  "schema": "genos.rust-llm-config/v1",
  "provider": {
    "kind": "ollama",
    "address": "127.0.0.1:11434",
    "model": "qwen2.5:0.5b",
    "generation": 1
  },
  "generation": {"max_output_tokens": 384, "temperature_milli": 0},
  "messages": [],
  "documents": ["notes.txt"],
  "contract": {
    "min_bytes": 16,
    "max_bytes": 8192,
    "required": ["Sources", "Limites"],
    "forbidden": [],
    "semantic_requirements": []
  },
  "limits": {"tokens": 8192, "model_calls": 2, "wall_ms": 150000},
  "max_input_tokens": 4096
}
```

Exécuter avec un modèle déjà installé chez le fournisseur choisi :

```powershell
cargo run -p genos-cli -- run "Rédige une note en français à partir du document, avec les sections Sources et Limites." --executor rust --workspace-root D:/work/mission --mission-id 271ed0bc-dbdc-4120-a580-83f9856a8559 --llm-config mission-llm.json
```

L'UUID identifie la mission et permet sa reprise. Les mêmes octets de sources,
la même requête et le même binaire restent nécessaires pendant le bail. La
configuration doit être relative au workspace. Les champs inconnus, chemins
traversants, symlinks, reparse points et hardlinks sont refusés. Les fichiers
Git, les répertoires privés GenOS et les fichiers d'environnement sont exclus
du contexte. Aucun document du workspace n'est ajouté implicitement.

La configuration accepte au plus 40 messages et 16 documents sélectionnés.
Chaque fichier est limité à 64 KiB, le bundle sérialisé des sources à 1 MiB,
et le contenu des messages effectifs à 64 KiB au total. La mission est ajoutée
comme message utilisateur ; les documents restent des données textuelles,
sans autorité sur les routes, budgets ou méthodes.

## Fournisseur et mesures

Ollama utilise une adresse IP de boucle locale et le chemin fixe `/api/chat`.
La sélection de modèle est explicite. Un serveur Ollama peut lui-même router
un modèle cloud : le choix du modèle reste une décision opérateur. Le client
ne suit pas de redirection, n'utilise pas les proxies implicites et ne
réessaie pas une inférence automatiquement.

L'adaptateur OpenAI accepte `{"kind":"openai","model":"...","generation":1}`
et utilise l'endpoint HTTPS fixe de Chat Completions. La clé
`OPENAI_API_KEY` est chargée en mémoire, sans sérialisation dans le contexte,
les reçus ou le CAS. Ce profil textuel demande `max_completion_tokens` et une
température : seuls les modèles compatibles avec ces paramètres conviennent.
Les tests contractuels OpenAI ne constituent pas une qualification cloud réelle.

`provider.generation` est une époque de configuration locale liée au binding.
Elle n'atteste pas les poids internes du fournisseur. Le nom de modèle demandé
et le modèle déclaré dans la réponse sont conservés séparément. Le corps HTTP
reçu, son empreinte et les faits de terminaison sont conservés ; une réponse
tronquée, un refus ou une demande d'outil ne sont pas un texte vérifié complet.

Les compteurs de tokens proviennent du fournisseur. Le runtime ne les déduit
pas de la longueur du texte. Les mesures partielles restent partielles ; leur
minimum connu est conservé et une exposition inconnue demeure retenue. Le
temps mural observé est celui de l'inférence, sans conversion en ATP ou USD.

## Contrat et portée de la complétion

Deux méthodes Rust du même binaire vérifient indépendamment les opérations
installées : limites d'octets UTF-8, présence des littéraux requis et absence
des littéraux interdits. Elles ne constituent pas deux autorités statistiques
indépendantes et ne prouvent pas la vérité de la prose.

Une publication réussie porte l'assurance `artifact_contract_verified` et la
portée `artifact_contract`. `semantic_truth_verified`, `promotable` et
`external_effects_authorized` restent faux. Un texte déclarant « PASS » ne
satisfait pas les obligations manquantes. Toute exigence dans
`semantic_requirements` reste non résolue tant qu'aucune méthode installée
ne peut l'établir ; une critique LLM ne la remplace pas.

Le rapport JSON `genos.rust-llm-mission-result/v1` contient le texte produit,
son empreinte, les verdicts et l'état comptable. Un contrat non satisfait,
une terminaison incomplète ou un usage inconnu donnent un candidat conservé
avec statut `unresolved`, sans publication et avec code CLI non nul. Un
transport HTTP réussi n'est donc pas présenté comme une mission complétée.

## Frontières des sept protocoles

| Protocole | Frontière exécutée |
| --- | --- |
| CONTINUITY | Binding courant vérifié en transaction ; checkpoint logique et succession sans remboursement des inconnus |
| MORPH | Roster locale et méthodes de chaque rôle installées, puis relues avant inférence et vérifications |
| SYNAPSE | Contexte effectif adressé appliqué et relu ; requête construite depuis ce contexte et candidate liée aux vérificateurs |
| ALLOSTASIE | Allocation, réserve protégée de 5 %, exposition avant HTTP et règlement sur mesures reçues |
| OMEGA | Intention, verrou d'effet et exposition atomiques ; permis de dispatch unique et attestation de son résultat réel |
| EVIDENCE | Relecture du contrat admis, des trois contextes et de l'observation attestée avant les deux vérifications |
| GQWF Exchange | Objets source, entrée, texte, reçu natif et fermeture rehashés entre deux namespaces CAS ; publication de tête atomique |

Le producteur HTTP et les deux méthodes de vérification s'exécutent dans le
processus Rust hôte. Le profil n'annonce ni trois processus modèles isolés,
ni un quorum MORPH distant, ni un transfert CAS réseau. Le stockage et le
fournisseur configuré restent de confiance opérateur local.

## Budgets et reprise

Les réserves sont arrondies au supérieur. Un budget de deux appels protège
ainsi un appel et autorise l'unique inférence installée de cette mission. Les
quotas ne sont jamais augmentés implicitement. `num_predict` ou
`max_completion_tokens` borne la demande de sortie ; le fournisseur applique
son propre template et compte ses entrées. Un dépassement constaté est
conservé comme consommation et dette, puis bloque la publication. Une
exposition locale ne garantit pas un plafond de facturation distant.

Après une réponse connue et durable, le runtime peut reconstruire les
contextes de vérification et terminer la publication sans nouvel appel LLM.
Une publication déjà committée est relue après revalidation, également sans
inférence. Les consommations ne sont pas remboursées. Une issue inconnue
interdit une relance automatique et bloque la succession tant qu'une
réconciliation adéquate manque.

Le checkpoint ne capture ni KV cache, ni poids du fournisseur. L'annulation
locale est coopérative avant et après l'appel bloquant ; elle attend sinon
la réponse ou l'échéance HTTP. Elle ne prouve pas l'arrêt du fournisseur.
L'expiration ne donne aucune nouvelle autorité, même lorsqu'un coût tardif
peut encore être enregistré.

L'[ADR 0780](../adr/0780-portage-missions-llm-runtime-rust.md) décrit les dix
points de livraison. La qualification distingue les fixtures HTTP des appels
réalisés avec un modèle installé.
