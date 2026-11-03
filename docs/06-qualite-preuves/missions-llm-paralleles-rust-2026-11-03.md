# Qualification des missions LLM parallèles Rust avec outils

**Date :** 3 novembre 2026.  
**Périmètre :** vagues bornées de tours LLM indépendants, outils privés et
sept protocoles selon l'[ADR 0785](../adr/0785-missions-llm-paralleles-et-outils-rust.md).

La [référence opérateur](../03-reference/missions-llm-paralleles-rust.md)
décrit la configuration, les quotas et les limites. L'assurance porte sur
le contrat d'artefact et la fermeture causale ; elle n'établit ni vérité
sémantique, ni autorité de promotion ou d'effets externes.

## Vérifications ciblées

| Groupe | Résultat |
| --- | --- |
| Admission, dépendances, réservations atomiques et coûts natifs | 6 tests passent |
| Journal de vague, événements, récupération, EVIDENCE et succession | 11 tests passent |
| Jointure de tous les workers après erreur ou panique | 2 tests passent |
| Runtime avec serveur HTTP concurrent et transactions réelles | 5 tests passent |
| CLI dans des processus neufs, outils, budgets et reprise | 6 tests passent |

Les dix-huit premiers tests unitaires ont passé ensemble ; le test de
succession ajouté ensuite a passé séparément sous les mêmes sources de
production. Les commandes actuelles de reproduction sont :

```powershell
cargo test -p genos-orchestrator --features native-llm --locked --lib parallel -- --test-threads=1
cargo test -p genos-orchestrator --features native-llm --locked --test agentic_parallel_runtime -- --test-threads=1
cargo test -p genos-cli --locked --test rust_agentic_parallel_mission -- --test-threads=1 --nocapture
```

Les fixtures HTTP attendent deux requêtes effectivement reçues avant de
répondre à la première. Une exécution séquentielle ne satisfait donc pas
cette preuve. Le DAG comporte deux lecteurs indépendants puis un rédacteur
qui dépend des deux. Le cas positif observe six HTTP, trois outils exécutés,
trois identités, quatre vagues de largeurs `2, 2, 1, 1` et un brouillon CAS
réel. Les deux résultats reçus figurent dans la requête du rédacteur.

Ces réponses HTTP contrôlées servent à vérifier le runtime ; elles ne sont
pas présentées comme des générations d'un modèle réel. Le cas sans option
parallèle conserve le parcours séquentiel. Un budget de tokens réduit la
largeur à un ; un quota d'appels réduit une vague ultérieure sans consommer
la réserve protégée ni permettre une complétion indue.

Les cas négatifs couvrent l'usage inconnu, la réponse HTTP ambiguë, la
jointure du frère retardé, le refus d'un journal hors du workspace natif,
la préparation concurrente par deux connexions et le rollback de toute une
vague si un membre dépasse le quota. Aucune nouvelle vague ne découle d'une
observation inconnue et aucune reprise ne recrée son permis.

Un trigger SQLite annule l'écriture d'artefact avant son reçu, après une
observation native réelle du rédacteur. Le second processus termine cet
outil connu, ferme la vague arrêtée avec un reçu de récupération puis
poursuit le dernier tour : six HTTP au total, trois outils et aucun renvoi
de l'observation conservée. L'historique d'arrêt reste présent. Un autre
cas conserve un frère au statut `intent` et vérifie que la reprise ne traite
pas les outils connus avant d'avoir toutes les observations de la vague.

La succession CONTINUITY est aussi refusée quand tous les HTTP sont connus,
les agents concernés terminés et les expositions nulles, mais que la vague
reste ouverte. Après jointure réellement enregistrée, le même transfert
devient admissible.

## Corrections issues de la qualification

La revue a ajouté la vérification des événements originaux de préparation,
jointure, arrêt et récupération. Des tests changent un timestamp puis
recalculent ses hashes, en gardant les observations natives authentiques :
ils restent refusés en l'absence de l'événement correspondant. Un reçu
authentique transplanté à une autre vague est également rejeté.

Une première fixture du journal déclarait deux agents sans outil, alors que
le transport structuré exige une définition d'outil. La configuration de
test a été corrigée avant admission en accordant `list_sources`, sans
imposer son invocation. Aucune garde de production n'a été affaiblie.

Le premier lancement CLI a subi un arrêt Windows `0xc0000409`. Son rejeu
isolé passait. Une sonde de socket a ensuite observé une lecture héritée
non bloquante refusée immédiatement, puis une lecture explicitement
bloquante expirée après 100 ms. La fixture remet désormais ses sockets
acceptés en mode bloquant et évite une seconde panique du destructeur
pendant une erreur déjà en cours. Le lien exact avec l'arrêt initial reste
une inférence, sans backtrace exploitable de cet arrêt.

Enfin, le premier cas de quota CLI proposait moins d'appels ordinaires que
d'agents, ce qui était refusé dès l'admission. Il utilise maintenant un
quota admissible de quatre appels, dont un protégé, et observe exactement
trois HTTP dans deux vagues de largeurs `2, 1`, puis le refus de continuer.
Les vérifications de non-publication et de non-recharge au rejeu restent
exigées. Les six cas CLI passent après ces corrections de fixtures.

## Essai avec un modèle réel local

Le CLI Rust est copié et vérifié avant exécution. Le workspace contient
uniquement une note publique synthétique et la configuration du test.
`PATH` est limité à ce workspace et `GENOS_MOCK_LLM=1` est présent : le
profil natif appelle malgré cela réellement Ollama. Aucun téléchargement,
appel cloud ou préchauffage extérieur à la mission n'a été exécuté.

| Observation | Résultat |
| --- | --- |
| Mission | `f16fd919-9118-42e0-aa81-75a67277bd99` |
| Incarnation | `6cec9e40-f1a2-4a53-a3a8-f70202eae927` |
| Fournisseur et modèle | Ollama local, `qwen2.5:14b`, capacités completion et tools |
| Résidence observée avant mission | Modèle absent de `/api/ps` ; aucun démarrage à froid garanti |
| Binaire SHA-256 | `ea904e6a9aa19fe466c23b71bcb97bda32a362f01352c8270e6e21204a281cc1` |
| Agents et largeur admise | Trois agents logiques ; plafond deux |
| HTTP et outils | Six observations natives ; deux `read_source` et un `write_artifact`, tous réussis |
| Vagues | Quatre vagues jointes, largeurs `2, 2, 1, 1` |
| Tokens reçus | 3 215, égaux à la somme des compteurs des six reçus |
| Temps agrégé mesuré | 47 152 ms ; quota 170 000 ms avec réserve protégée |
| Temps écoulé du premier processus | 37,393 s, code zéro, `completed` |
| Reprise par un autre processus | 5,817 s, code zéro, même publication et même usage |
| Métriques de reprise | Zéro nouvelle vague, zéro nouveau worker |
| Expositions et inconnus finaux | Zéro ; budget libéré |

Le brouillon contient réellement 170 octets, d'empreinte
`646dd096528a50b2ebdfd81a44897b0a96cd8a0735c3ad40ae35459cb1e447bd`.
Les deux copies reçues sont rehachées et leur projection exacte apparaît
dans les contextes SYNAPSE du rédacteur. Les sept protocoles sont présents
dans le journal. La publication GQWF, le reçu OMEGA et la tête CAS sont
effectivement persistés sous preuve EVIDENCE.

L'audit indépendant relit les vingt-deux fichiers du manifeste, les
réponses HTTP brutes et une copie SQLite cohérente ouverte en lecture seule
immuable. Son empreinte reste identique avant et après audit. Le rejeu
conserve strictement les observations, événements, membres, historiques de
reçus, objets, publication et compteurs. Aucun nouveau dispatch n'apparaît.

Les métriques attestent ici des workers de tours du runtime. Elles ne
certifient pas le calcul simultané des générations dans Ollama. L'état
préalable de `/api/ps` et cet essai unique ne suffisent pas non plus à
garantir les performances d'un démarrage à froid ou sous toute charge.

## Contrôles globaux

| Commande | Résultat |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Code zéro, 8 801 sources, aucune violation |
| `cargo test --workspace --locked` | Code zéro, 1 167 tests passés, 147 cibles, aucun échec ni test ignoré |
| `npm test` | Code zéro, chaîne racine complète et 14 suites de composition d'inventaire passées |

La suite Node du chantier a attendu la libération du verrou déjà actif,
puis a lancé sa propre chaîne complète. Aucun verrou ni processus
étranger n'est supprimé et aucun jeton d'exécution n'est réutilisé.
L'environnement du processus utilise `core.safecrlf=false` pour éviter la
saturation des buffers par les avertissements de conversion ; une sonde
compare les chemins Git contrôlés avant et après et confirme leur égalité.
Les contrôles de conflits et toutes les suites restent actifs.

## Provenance et limites

Les descriptions et scripts d'audit, configurations, réponses brutes,
journaux et bases restent hors Git. Le manifeste local
`.genos-agent-worlds/parallel-delivery-final.json` et son audit associé lient
les dix commits, les sources, résultats de commandes et preuves de l'essai.
Les arrêts et échecs de qualification antérieurs restent conservés comme tels.
Les preuves de la livraison séquentielle précédente ne sont pas réécrites.

L'assurance est `artifact_contract_verified` : `semantic_truth_verified`,
`promotable` et `external_effects_authorized` restent faux. Les outils
accordés sont des permissions, pas une preuve que chaque instruction libre
a été satisfaite. Le fournisseur et le stockage restent de confiance
opérateur local ; aucune isolation par processus ou attestation des poids
du modèle n'est revendiquée. La reprise conserve les observations et effets
durables, sans restaurer des poids ou un KV cache.
