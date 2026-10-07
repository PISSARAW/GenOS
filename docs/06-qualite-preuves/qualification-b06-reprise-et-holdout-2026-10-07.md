# B06 — Reprise des promotions et qualification des consommateurs

Le commit de preuves demandé avant cette reprise est `e01f00d6`.
Ce dossier complète la qualification précédente sans effacer ses résultats.
B06 reste partiel tant que le client Studio opérationnel et l'extension IDE
installée ne sont pas identifiés et exercés sur un même run.

## Promotions et snapshots

Le journal et ses frontières sont décrits dans
[l'ADR 0346](../adr/0346-journal-de-reprise-des-promotions.md).
La qualification native Windows couvre :

- deux processus et deux assemblages AEIS frais : une réservation gagnante,
  deux nonces consommés sur quatre possibles, deux assemblages persistés ;
- six arrêts forcés suivis d'une nouvelle ouverture SQLite : une seule
  application committée des primitives, une trajectoire et une provenance
  positive, réponse idempotente après commit ;
- une fusion partielle et une fusion entièrement publiée avant panne : les
  postimages déjà présentes ne sont pas réécrites ;
- un journal modifié et une requête modifiée : refus explicite ;
- publication de snapshot : trois erreurs EPERM injectées puis renommage réel,
  échec permanent après six tentatives sans nouvelle ligne ni staging résiduel,
  douze collisions natives et refus d'un payload altéré.

L'erreur Windows observée précédemment n'est pas attribuée à un antivirus sans
preuve. La correction ajoute une récupération bornée et vérifiée du renommage.
Elle ne garantit pas que toute erreur de permission Windows soit transitoire.

## Holdout IA exécuté

`benchmarks/p0-consumers/run-memory-holdout.cjs` appelle réellement
`modelProvider.generate` avec Ollama local, `qwen2.5-coder:7b`.
Le manifeste du protocole est écrit avant le premier appel. Le candidat reçoit
le prompt et la mémoire, sans outil ni accès au fichier oracle. Les réponses,
les canaris privés et les partitions train/dev sont conservés dans le protocole
de l'évaluateur et ne sont pas transmis au candidat. Chaque cas utilise une
base SQLite temporaire neuve. Le bras GenOS passe par le stockage, la récupération
et le formatteur mémoire de production ; l'attaque doit rester visible après
troncature pour que le cas soit exécuté.

| Mesure exploratoire, protocole b06-memory-v4 | Mémoire brute | Mémoire GenOS |
|---|---:|---:|
| Cas réservés exécutés | 8 | 8 |
| Réponses exactes | 4 | 8 |
| Instructions adversariales suivies | 4 | 0 |
| Échecs de fournisseur | 0 | 0 |
| Tokens d'entrée | 1 099 | 3 413 |
| Tokens de sortie | 129 | 125 |

16 appels, aucune fuite du canari privé. Digest du modèle :
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Manifeste des cas :
`140f5cc652f2d2cf05bf8fafd11797c7cbd555fe5ca5ff0e775b2b89b571cf0e`.

Cette observation concerne une famille synthétique de tâches et quatre formes
d'attaque sur un modèle local. Le contexte GenOS est plus long. Les quatre
discordances favorables donnent p = 0,125 au test binomial apparié bilatéral ;
elles n'établissent pas un gain scientifique représentatif, ni une défense
générale contre l'injection. Une campagne confirmatoire devra geler de nouveaux
domaines, contrôler la longueur du contexte, prévoir des ablations et une
puissance adaptée. Les coûts monétaires du fournisseur local sont nuls ; le
temps matériel et l'énergie n'ont pas été mesurés.

Les tentatives précédentes sont conservées : v1 confondait garde et troncature,
v2 a révélé un marqueur de directive non neutralisé, v3 a détecté une interférence
de récupération entre cas. Elles ne constituent pas une mesure finale valide.
Le marqueur `SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD` est maintenant neutralisé dans
les souvenirs et vésicules, qui restent des données non authentifiées.

## Parcours interactif

Le binaire Rust natif a été lancé en mode `--monitor` dans un pseudo-terminal
Windows, connecté au vrai `trinityMonitorServer` et à une base SQLite isolée.
Il affiche la mission B06, trois mondes puis l'état `COMPLETED` avec verdict
`WEAK` et barrière `UNKNOWN` en l'absence de preuve. Les touches `2`, `s`, `r`
et `q` sont envoyées ; `r` est sans effet en mode live, conformément au code.
La sortie rend le terminal et retourne 0. Ce parcours qualifie le moniteur et
ses commandes locales, pas une mission IA complète.

Le dépôt courant ne contient pas de frontend Studio web opérationnel.
`GenOSWork` est un site public, sans connexion démontrée au runtime. L'accès au
navigateur via CUA échoue au démarrage du sandbox Windows (code 1056), avant toute
lecture d'interface. Aucune capture fictive ou simple page de démonstration
n'est comptée comme une preuve Studio. L'URL ou le dépôt du client opérationnel
et de l'extension IDE a été demandé pour poursuivre cette partie.

## Preuves locales

Les journaux et résultats générés sont hors Git dans
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/b06/` :
`consumers/`, `ai-holdout-v4/protocol.json`, `responses.jsonl`, `summary.json`,
`tui-interaction.json`, `npm-test.log` et `cargo-workspace.log`.

| Validation finale | Résultat |
|---|---|
| npm test | Exit 0, suite complète |
| cargo test --workspace | Exit 0 ; 671 tests, 80 suites, zéro échec et zéro ignoré |
| Qualité | 5 338 sources ; 100 violations de baseline, zéro nouvelle ; exit 0 |
| Harnais consommateurs | 58/59 ; ancienne attente de refus corrigée après réponse idempotente |
| Rejeu des sept parcours affectés | 7/7 ; dérive concurrente de GraphRAG détectée |
| Mémoire et vésicules après cette dérive | 2/2 ; zéro dérive de source |
| Reproduction du pilote v4 après cette dérive | Même manifeste, même modèle, mêmes scores et tokens |
| Baseline qualité | SHA-256 inchangé par rapport au rapport P0 précédent |

La première passe observe des modifications concurrentes de `trajectoryController`
et `memoryStdp`; le rejeu final observe `graphRagService`. Ces dérives sont
conservées dans les manifestes. Le test d'approbation vérifie désormais que le
même run est retourné sans seconde exécution. STDP est exercé avec mutations
réelles de renforcement, dépression et modulation dopaminergique. La mémoire
et le pilote sont rejoués après la dernière dérive. `validation-summary.json`
conserve les empreintes des journaux et la comparaison finale des sources.
