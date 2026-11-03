# Qualification des missions LLM multi-agents Rust avec outils

**Date :** 3 novembre 2026.  
**Périmètre :** DAG natif de deux à quatre agents logiques, appels structurés
et quatre outils confinés, sous les sept protocoles de l'[ADR 0781](../adr/0781-missions-llm-multi-agents-et-outils-rust.md).

La [référence opérateur](../03-reference/missions-llm-multi-agents-rust.md)
décrit la configuration et les limites. Le profil utilise des identités et
dialogues distincts dans le même processus hôte. L'assurance finale reste
`artifact_contract_verified` ; vérité sémantique, promotion et autorité de
déploiement restent explicitement non établies.

## Vérifications ciblées

| Cible | Résultat |
| --- | --- |
| API Rust : transport historique et outils structurés | 43 tests passent |
| Observations opaques : documentation `compile_fail` | 2 tests passent |
| Admission, sources, permissions et DAG | 6 tests passent |
| Journal, budgets, concurrence, inconnus et identité des étapes | 9 tests passent |
| Projection du dialogue et provenance intégrale | 2 tests passent |
| Quatre outils, artefacts reçus et dispositions négatives | 10 tests passent |
| EVIDENCE, contexte consommé et publication GQWF | 5 tests passent |
| CLI multi-agents et outils | 9 tests passent |
| CLI textuel précédent, régressions ciblées | 9 tests passent |
| Autorisation CLI existante, répertoires temporaires isolés | 5 tests passent |

Commandes de reproduction :

```powershell
cargo test -p genos-api --locked --lib --tests
cargo test -p genos-api --locked --doc
cargo test -p genos-orchestrator --features native-llm --locked --test agentic_admission --test agentic_ledger --test agentic_tools --test agentic_terminal --test agentic_context_projection -- --test-threads=1
cargo test -p genos-cli --locked --test rust_agentic_mission -- --nocapture
cargo test -p genos-cli --locked --test rust_llm_mission
cargo test --workspace --locked --test neuro_glia_stream_cli -- --nocapture
```

Les fixtures servent de vraies réponses HTTP contrôlées, comptent les
requêtes et inspectent les messages effectivement reçus. Elles ne sont pas
présentées comme des générations d'un modèle réel. Le cas CLI positif
observe quatre inférences, deux outils, deux identités d'agents, le texte du
prédécesseur dans le dialogue du destinataire et les octets réels du brouillon
dans le CAS. Le second processus relit la publication sans nouvelle inférence.

Un autre cas CLI injecte un trigger SQLite avant le reçu du brouillon, après
l'observation réelle du modèle rédacteur. L'échec annule ensemble l'effet CAS,
le compteur, l'intention et le reçu de l'outil. Après retrait du trigger et
expiration de l'ancienne échéance HTTP, un second processus termine depuis
l'observation connue : quatre HTTP au total, deux outils et aucun redispatch
de l'observation conservée. Aucun état de mission terminée n'est rebobiné.

Les tests couvrent également les quatre outils réellement exécutés,
les copies d'artefacts dans le namespace du destinataire, les audiences
non admises, chemins traversants, hardlinks, contenus CAS corrompus,
reçus falsifiés et appels écrits uniquement dans la prose. Une terminaison
incomplète ou un usage inconnu ne peut pas alimenter les outils ni la publication.

## Durcissements et erreurs de qualification

L'audit a corrigé deux substitutions possibles dans les getters : une
observation native valide d'une autre étape et un reçu valide d'un autre
appel devaient être comparés à la clé demandée avant toute validation de
leur contenu. Les régressions transplantent de vrais résultats HTTP et
reçus exécutés, pas uniquement un JSON inventé.

Une réponse HTTP incomplète contenant déjà des compteurs complets ne peut
pas rendre son issue connue : son minimum mesuré est conservé et l'exposition
complète demeure retenue. La reprise d'un outil terminé réutilise aussi
l'allocation d'origine, sans recalculer son intention depuis le budget restant.

Une erreur d'insertion d'un contrôle de reçu a été corrigée avant les tests
ciblés. Deux erreurs de fixtures ont ensuite été rectifiées sans affaiblir
les assertions : reconnaissance des refus Windows de partage de fichier
32/33, et suppression d'un nom d'artefact dans une configuration dépourvue
de permission d'écriture, avant admission. Les refus de production étaient
corrects. Les composants de chemin ambigus sont également refusés à l'admission.

La première fixture d'allocation adaptative utilisait deux délais de 600 ms
sous des fenêtres de 1 s et expirait réellement pendant la qualification.
Elle utilise maintenant deux réponses retardées de 3 s, un plafond de 5 s
et un budget de 10 s. Les mêmes assertions restent exigées : allocation
suivante inférieure au plafond, quatre HTTP, deux outils, publication et
rejeu sans nouvelle consommation. Les neuf tests du journal passent.

Un contrôle global a également échoué dans le test existant d'autorisation
`neuro_glia_stream_cli`, sur une signature de producteur. Les rejeux isolés,
y compris sous les mêmes features workspace, passent. Une sonde Rust de cinq
threads a mesuré 904 horodatages identiques au même tour sur 10 000 tours :
ces horodatages seuls ne garantissaient pas des répertoires temporaires
distincts. Le fixture ajoute désormais un UUID à leur nom. Ses cinq tests
parallèles passent ensemble ; aucune vérification de signature ni assertion
n'a été modifiée. Le lien exact avec l'échec initial reste une inférence,
les chemins des tests n'ayant pas été journalisés à ce moment-là.

## Essais avec des modèles locaux

Tous les essais utilisent une copie vérifiée du CLI Rust, un workspace
synthétique neuf, `PATH` limité à ce workspace et `GENOS_MOCK_LLM=1`.
Le parcours natif appelle malgré cela Ollama réellement. Aucun outil ni
résultat modèle n'est synthétisé pour transformer un échec en succès.

Empreinte SHA-256 du binaire des quatre premiers essais :
`a5f8afdec3e43384dc7f84b919543c2f2de2e920c2838ab0dddcf7c8ac6a52f9`.

| Essai | Observations et disposition |
| --- | --- |
| `qwen2.5:0.5b`, mission `d27ae8b5-cdb4-44e5-b389-4fcfe38d2618` | `read_source` exécuté, puis réponse tronquée à 256 tokens ; 2 appels, 1 215 tokens mesurés, 1 outil, statut non résolu, aucun brouillon ni publication |
| `qwen2.5-coder:7b`, mission `7e8b624b-2c3a-4c69-b220-367abcdbcf16` | JSON d'appel dans la prose, aucun `tool_calls` natif ; puis échéance HTTP de 40 s. 2 appels, minimum connu de 419 tokens, aucun outil ; exposition de 8 448 tokens, 1 appel et 40 000 ms retenue, aucune publication |
| `qwen2.5:14b`, mission `ec048303-99f5-4168-b9e3-1e2fcfc140cb` | Première inférence expirée après 50 s, aucune observation connue et aucun outil ; exposition de 8 384 tokens, 1 appel et 50 000 ms retenue, aucune publication |
| `qwen2.5:14b` déjà chargé, mission `e3fb57b4-1a7c-43c9-b3df-a27785021e5a` | Analyste terminé après un vrai `read_source`, puis premier appel du rédacteur expiré après 50 s ; 3 appels, 950 tokens connus et 1 outil ; exposition de 8 384 tokens, 1 appel et 50 000 ms retenue, aucun brouillon ni publication |
| `qwen2.5:14b` absent de `/api/ps` avant mission, `b1747363-e80c-46ee-9bbc-06236b4eec52` | Binaire ajusté, analyste terminé et deux outils exécutés, brouillon CAS réel ; dernier tour du rédacteur expiré dans sa fenêtre restante de 5 206 ms, statut non résolu ; 4 appels, 1 440 tokens connus, 161 189 ms mesurées, aucune publication |
| `qwen2.5:14b` résident avant mission, `1cd6de6d-8c9a-4073-b2b1-de6d16907fd8` | Réussite qualifiée du contrat : 2 agents terminés, 4 inférences, `read_source` et `write_artifact` exécutés, 2 051 tokens, 55 232 ms mesurées, publication sous les sept protocoles ; second processus terminé sans nouvel appel, effet ou débit |

Les cinq premiers essais sont **non qualifiés pour la réussite d'une mission à deux
agents avec outils**. Ils établissent des refus réels : troncature, prose
non exécutable et issue inconnue conservée. Aucune de ces missions inconnues
n'a été redispatchée. Les dossiers des essais sont conservés séparément.

Le quatrième essai a motivé deux ajustements bornés : projection des données
utiles des dépendances dans le dialogue, tout en gardant leur provenance
complète dans le contexte, et allocation du temps restant au prochain tour
au lieu d'exiger systématiquement le plafond configuré. Les quotas globaux,
le bail et les exigences de preuve ne sont pas augmentés. Un test utilise
des réponses HTTP réellement retardées, puis contrôle les allocations et le
rejeu sans nouveau coût ; un autre altère seulement la provenance conservée
et vérifie le refus du contexte.

Les deux derniers essais utilisent le même binaire ajusté, de SHA-256
`8ce012e1000c2363410791d391249871844774a6f924d42b6ef7113cad528710`,
avec une configuration et un prompt identiques : plafond par tour 120 s,
quota global 170 s, bail 180 s et sortie maximale 192 tokens. La résidence
du modèle diffère à l'observation préalable ; cette comparaison ne suffit
pas à isoler causalement le coût du chargement ni à garantir un démarrage à froid.

Le sixième essai prend 61,152 s de temps écoulé, puis 4,405 s au rejeu.
Les quatre réponses HTTP brutes ont été rehachées et leurs compteurs
additionnés. Le brouillon et le résultat contiennent réellement 55 octets,
d'empreinte `d65d56c677c458d22f3db7fd93ee0c6457c62e0c81d47469985cd2198ca3b78c`.
Les deux processus retournent la même publication, le même usage et les
mêmes observations, événements, outils et objets CAS. Les expositions sont
nulles, aucun inconnu ne subsiste et le budget est libéré. Le statut
`completed` ne vaut que pour le contrat d'artefact ; les trois indicateurs
de vérité sémantique, promotion et autorité d'effets externes restent faux.

## Contrôles globaux

| Commande | Résultat |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Code zéro, 8 766 sources, aucune violation |
| `cargo test --workspace --locked` | Code zéro, 1 126 tests passés, 145 cibles, aucun échec ni test ignoré |
| `npm test` | Code zéro, chaîne racine complète et 14 suites de composition d'inventaire passées |

La première invocation Node de ce chantier s'est arrêtée au préflight car
une autre suite détenait le verrou partagé. Le chantier a attendu sa
libération pour lancer sa propre exécution ; aucun verrou ni processus
étranger n'a été supprimé et aucun jeton de suite imbriquée n'a été réutilisé.

La première exécution indépendante a ensuite atteint le préflight backend,
où les avertissements Git LF/CRLF ont saturé le buffer de `spawnSync`
(`ENOBUFS`). Son code un et son journal sont conservés. La relance utilise
`core.safecrlf=false` uniquement via la configuration Git du processus de
test : la liste des chemins contrôlés a été comparée et reste identique,
les contrôles de conflits et toute la suite restent exécutés.

Un scan qualité intermédiaire a aussi vu trois violations dans des fichiers
backend modifiés simultanément par un autre chantier. Elles sont conservées
dans le journal négatif ; les extractions correspondantes ont été effectuées
par ce chantier et un nouveau scan global a été exécuté ensuite.

## Limites et provenance

Les contrats structurels et la clôture des opérations sont vérifiés ; les
consignes libres et la vérité générale du texte ne sont pas certifiées.
Les outils déclarés constituent des permissions, pas une obligation
automatique pour le modèle de les appeler. Le profil ne comporte ni shell,
ni écriture arbitraire du workspace, ni outils réseau génériques, ni quorum
de processus distants. La confiance reste celle de l'opérateur local.

Les tests OpenAI restent des tests de protocole ; aucune génération cloud
payante n'est qualifiée ici. Un tag de modèle ou une génération locale ne
constitue pas une attestation cryptographique des poids du fournisseur.
La reprise concerne observations et effets durables, sans KV cache.

Les journaux, configurations d'essais, réponses brutes et bases restent hors
Git. Le manifeste local `.genos-agent-worlds/agentic-delivery.json` conserve
les dix commits, leurs fichiers, les empreintes de sources et de journaux,
les preuves d'essais et les résultats de commandes. La persistance GenOS
des décisions et expériences n'est pas assimilée à une preuve d'exécution.
