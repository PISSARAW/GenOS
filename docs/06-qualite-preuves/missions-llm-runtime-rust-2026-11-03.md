# Qualification des missions LLM natives Rust

**Date :** 3 novembre 2026.  
**Périmètre :** génération textuelle HTTP dans Rust et contrat d'artefact sous
les sept protocoles, conformément à l'[ADR 0780](../adr/0780-portage-missions-llm-runtime-rust.md).

## Résultat et portée

Le parcours `genos run --executor rust --llm-config ...` est raccordé à
CONTINUITY, MORPH, SYNAPSE, ALLOSTASIE, OMEGA, EVIDENCE et GQWF Exchange.
La [référence opérateur](../03-reference/missions-llm-runtime-rust.md) décrit
la configuration, les budgets et les frontières réellement exécutées.

Le résultat qualifié est un texte produit par un fournisseur explicite,
dont le contrat structurel est vérifié par deux méthodes Rust installées.
L'assurance reste `artifact_contract_verified`. Les champs
`semantic_truth_verified`, `promotable` et `external_effects_authorized`
restent faux, y compris après publication. Le producteur et les deux
vérificateurs s'exécutent dans le même processus hôte.

## Tests exécutables

| Vérification ciblée | Résultat |
| --- | --- |
| `genos-api` : bibliothèque et deux cibles HTTP natives | 30 tests passent |
| Documentation de l'observation opaque, cas `compile_fail` | 1 test passe |
| Contrats, admission, SYNAPSE, EVIDENCE, ALLOSTASIE, OMEGA et GQWF | 39 tests passent |
| Requalification d'une observation durable et refus de falsification | 3 tests unitaires passent |
| CLI LLM, comptage des appels et reprise dans un second processus | 9 tests passent |
| Régressions CLI `integer_sum` et publication existante | 14 tests passent ; branche symlink Windows non exercée |

Commandes de reproduction des tests ciblés :

```powershell
cargo test -p genos-api --locked
cargo test -p genos-api --doc --locked
cargo test -p genos-orchestrator --features native-llm --locked --test llm_contract --test llm_foundation --test llm_synapse --test llm_evidence --test llm_allostasis --test llm_omega --test llm_gqwf
cargo test -p genos-orchestrator --features native-llm --locked --lib mission_protocols::llm_evidence::recovery_tests
cargo test -p genos-cli --locked --test rust_llm_mission --test rust_native_mission --test rust_protocol_publication -- --nocapture
```

Les fixtures HTTP servent des réponses contrôlées et comptent les requêtes.
Elles testent notamment les refus et troncatures, les paramètres malformés,
l'usage partiel ou absent, les dépassements, le contexte ou le contrat altéré,
la falsification d'un reçu et les reprises sans double débit. Elles ne sont
pas présentées comme des générations de modèle réelles.

Le test CLI de reprise injecte un échec transactionnel par un trigger SQLite
au moment de la publication, après une observation réelle de la fixture.
Le second processus reprend cette observation et publie ; le serveur n'a reçu
qu'un appel. Il ne reconstruit pas artificiellement un état ancien depuis
une mission déjà terminée.

Deux défauts de fixtures ont été corrigés pendant la qualification : socket
accepté hérité non bloquant sous Windows, puis initialisation CAS manquante
dans un test de fondation. Les assertions et les gardes de production ont
été conservées. La création du symlink d'une régression existante échoue avec
le privilège Windows manquant ; cette branche reste explicitement non exercée.

## Génération avec un vrai modèle local

Le 3 novembre, entre **06:58:39 et 06:58:55 UTC**, une mission a utilisé
Ollama sur `127.0.0.1:11434`, avec le modèle installé `qwen2.5:0.5b`.
Aucun téléchargement de modèle ni appel cloud payant n'a été nécessaire.
La mission portait l'identifiant `47140180-c7b1-4a7d-84be-f7457f46ee61`.

La configuration demandait au plus 384 tokens de sortie, une température
nulle, une exposition déclarée de 4096 tokens d'entrée, un budget de 8192 tokens, deux appels
dont la réserve protégée et 170 000 ms d'inférence. Un document synthétique
sélectionné explicitement rappelait la différence entre transport et preuve.
Le contrat exigeait les littéraux `Sources` et `Limites`, entre 40 et 8192
octets, sans obligation sémantique déclarée.

La déclaration d'entrée ne repose pas sur un tokenizer local et ne garantit
pas une borne avant l'appel. Le fournisseur a mesuré 264 tokens d'entrée ;
un dépassement observé aurait conservé sa consommation et bloqué la publication.

Le premier processus CLI termine avec code zéro et une publication de
génération 1. Le texte produit est :

```text
Sources : Transport et preuve

Limites : La verité générale du texte reste non vérifiée.
```

| Mesure réellement reçue | Valeur |
| --- | --- |
| Modèle demandé et déclaré | `qwen2.5:0.5b` |
| Tokens d'entrée | 264 |
| Tokens de sortie | 24 |
| Tokens débités | 288 |
| Appels modèle débités | 1 |
| Exposition retenue après règlement | 0 |
| Reprise dans un second processus | Code zéro, même artefact et publication, aucun nouveau dispatch |

Les octets du corps HTTP conservé ont été rehashés et comparés au reçu natif.
Le texte Ollama, le modèle déclaré, la terminaison `done`, les compteurs et
le rapport CLI concordent. La base conserve un seul reçu de dispatch après
la reprise. Les événements des sept protocoles figurent dans le rapport.

Le test utilise une copie du binaire vérifiée par SHA-256, un workspace neuf
et un `PATH` limité à ce workspace, sans Node. `GENOS_MOCK_LLM=1` était défini
pour vérifier que le parcours natif continue à utiliser le fournisseur réel.
Le SHA-256 du binaire est
`551650ae80539e2941dd023055eed2632c3e96c8f46a5736f60d11d189b36b93`.
Le digest du tag déclaré par Ollama est
`a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67` ;
il ne constitue pas une attestation cryptographique des poids exécutés.

## Contrôles globaux

| Commande | Résultat |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Code zéro ; 8 714 fichiers, aucune violation |
| `cargo test --workspace --locked` | Code zéro ; 1 071 tests passés, aucun échec |
| `npm test` | Code zéro ; suite racine complète, inventaire final 14/14 |

Les tests du parcours natif restent des fixtures contrôlées ; l'essai Ollama
ci-dessus constitue la qualification avec un vrai modèle. La suite globale
Rust consulte aussi l'ancien Thalamus dans un test historique ; ce parcours
historique n'est pas assimilé à une preuve de génération native.

## Limites conservées

L'adaptateur OpenAI est testé sur les contrats de requête et de réponse ;
aucune génération OpenAI réelle n'est qualifiée ici. Les deux méthodes
structurelles du même hôte ne constituent pas des autorités sémantiques
indépendantes. Une exigence sémantique sans méthode adéquate reste non résolue.

Le périmètre n'inclut ni outil ou shell choisi par le modèle, ni quorum
distant, ni transfert CAS réseau, ni service multi-tenant authentifié. Les
sources, le fournisseur et le stockage restent de confiance opérateur local.
La reprise porte sur les observations durables et la publication ; aucun
checkpoint de poids ou de KV cache du fournisseur n'est revendiqué.

Les journaux, la base de l'essai, les réponses brutes et le dossier de preuve
local restent hors Git. Leurs empreintes et les dix commits sont conservés
dans le manifeste local de livraison sous `.genos-agent-worlds/` ; ce dossier
local constitue une provenance d'essai, sans autorité de promotion.
