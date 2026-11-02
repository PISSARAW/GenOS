# Mission native reliée au journal AGOW

- **Date** : 2026-11-02
- **Statut** : raccord et qualification locale exécutés
- **Portée** : calcul natif `subset_sum`, sous contrats et autorités GenOS
- **Socle committé** : `1f7179f20`
- **Décision** : [ADR 0767](../adr/0767-mesures-agow-depuis-oracle-natif.md)

## Parcours réellement exécuté

La commande `npm --prefix backend run test:agow:native` crée une base et un
workspace isolés. Elle provisionne une organisation, un projet et une autorité
de délégation bornée, puis appelle le véritable service de délégation pour un
worker natif. Aucun exécuteur ni vérificateur n'est remplacé par un mock.

La mission calcule un témoin de somme 10 à partir de `[3, 5, 7]`. Le planning
réel produit un frame et un reçu de mode AGOW, puis la création du run persiste
leur liaison. Le worker exécute le calcul sous son contrat. Les oracles
`subset_bitset` et `subset_enumeration` vérifient le résultat dans deux processus
distincts. Les gates natifs acceptent les preuves et clôturent le run.

Le raccord relit l'événement terminal canonique, le reçu biologique et son
budget, la chaîne d'observations et l'acceptation scellée. Il revalide les preuves
de clôture avant de persister la mesure AGOW. Le vérificateur standard est résolu
depuis le contrat de mesure persistant ; aucun callback par mission n'est laissé
dans un registre mémoire. Un callback hôte explicite conserve sa priorité.

## Résultat final observé

| Élément | Valeur |
| --- | --- |
| Run | `strategy_run_1793638061595_3bdea4e8` |
| Agent | `delegation-sub-d1` |
| Statut du run | `completed` |
| Statut de l'observation AGOW | `verified` |
| Contrat de mesure | `genos.agow.native-subset-outcome/v1` |
| Perte observée / progression | 0 / 1 |
| Processus de vérification | 23556 et 26540, distincts du processus hôte |
| Stratégies | `subset_bitset`, `subset_enumeration` |
| Temps cumulé des exécutions d'oracle | 485 ms |
| Tokens de modèle pour ces vérifications | 0 |
| Coût de calcul local en USD | Inconnu (`null`) |
| Crédit ou promotion supplémentaire par AGOW | Aucun |

La réserve de ressources, la stabilité, les blocages et les violations de
viabilité ne sont pas mesurés ; ces champs restent `null`.

## Contre-tests

La qualification refuse une mission étrangère, un contrat de mesure différent,
une réponse terminale substituée et un run portant un guardrail. Les triggers
de stockage empêchent la réécriture du reçu biologique scellé et la régression
d'une observation déjà appliquée. Après ces tentatives refusées, la preuve
originale est encore revalidable et la relecture du journal reste idempotente.

Un premier essai de raccord cherchait à tort la mission dans une colonne du run.
Le run avait terminé, mais l'observation restait en attente. L'identité est portée
par la liaison biologique scellée ; le raccord la recoupe désormais avec agent
et run. Cet essai n'est pas retenu comme qualification finale.

## Vérifications

| Commande | Résultat observé |
| --- | --- |
| `npm --prefix backend run test:agow` | Code 0 : 15 tests du journal, qualification native réelle et suite AGOW historique |
| `python scripts/ci/check_code_quality.py` | Code 0 : 8 316 sources, aucune violation nouvelle |
| Contrôle ciblé des six sources du raccord et de ses tests | Code 0 : aucune violation |
| `python scripts/ci/check_adr_index.py` | Code 0 : 900 fichiers et 900 entrées lors de ce contrôle |
| `cargo test --workspace` | Code 0 lors de cette exécution |
| `npm test` | Refus du précontrôle : 278 MiB disponibles pour 512 MiB requis |

Une tentative de suite AGOW a aussi été refusée par la réserve de 256 MiB du
workspace, avant lancement du calcul. Les bases des essais terminés ont été
compressées sans perte puis relues et comparées par SHA-256. Le passage final
ci-dessus a réussi après cette récupération d'espace. Aucun seuil de disque,
contrat ou gate n'a été contourné.

## Artefacts locaux

Les artefacts ignorés par Git sont conservés sous :

`.genos-agent-worlds/agow-native-mission/3807dafe-1e03-49f0-950e-9a0ed15cbc84/`

- `manifest.json` écrit avant exécution : méthode, métrique et hashes des sources
  importantes du raccord et des tests.
- `report.json` : liaison AGOW, terminal, reçu biologique, coûts et stratégies.
- `mission.sqlite` : état durable et preuves scellées.
- Hash du manifeste :
  `sha256:8239f2a41a3fa30d7e283c292b4c117fd6b1219047ef90ef5604464cb353959d`.
- Hash du rapport :
  `sha256:8afa87294a626806cc30a9c1dfc72c05fe76732a254788a03e109cb76d688a3d`.

Les logs des commandes sont sous `.genos-agent-worlds/agow-native-validation/`.
Les anciens essais compressés conservent `mission.sqlite.zip` et
`database-archive.json`, avec le hash de la base décompressée.

Les sources du raccord suivant sont locales et non encore committées dans ce
rapport. Le dépôt reçoit aussi des modifications concurrentes ; les hashes de
sources précisent le contenu mesuré. Le manifeste n'archive pas exhaustivement
toutes les dépendances et ne constitue pas une réplication externe.

## Limites

L'exécution de la mission est réelle, sur une entrée artificielle connue. Le
worker natif s'exécute dans le runtime hôte ; seuls les oracles sont des processus
distincts. Ce parcours ne qualifie ni un worker LLM, ni le superviseur de processus,
ni un transport réseau ou une réorganisation morphogénétique.

La perte binaire vaut 0 uniquement sur une acceptation métier revalidée. Un refus
ou une preuve absente reste inconnu ; le raccord n'invente pas une perte 1. Ce
périmètre ne fournit donc pas encore une campagne comparable de succès et d'échecs.
Aucun gain causal d'AGOW, apprentissage ou calibration statistique n'est démontré.
