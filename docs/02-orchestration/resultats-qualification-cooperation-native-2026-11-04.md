# Résultats de la qualification de coopération native — 4 novembre 2026

## Périmètre et verdict

Le banc utilise le bootstrap et les portes de preuve natifs. Les fixtures HTTP
contrôlées démontrent le câblage, y compris un remplacement après deux échecs.
Elles ne démontrent pas les capacités d’un modèle réel. Le verdict LLM doit être
lu séparément ci-dessous ; aucune promotion de source n’est autorisée.

## Corrections livrées

- `caf89e151` : bootstrap complet du coordinateur, ADN conservé depuis la fabrique,
  admission clinique, planification routée après constat vérifié, réserve commune,
  quiescence, dossier natif et clôture par homéostasie ; échéances numériques et
  preuves terminées consommées à leur instant scellé.
- `56b2ec378` : comparaison du bail avec la politique native officielle, qui
  ajoute `genos_replay` au runtime. Cet outil n’est pas attribué à un appel LLM.
- `b303a9dee` : lignée liée à la capsule finale, génome et contrat de vérification
  hérités, admissions propres à la nouvelle identité ; substitution enregistrée
  dans la régénération uniquement après preuve native et égalité du contrat,
  tenant, mission et source échouée. Les échecs et leurs coûts restent visibles.
- `169a767fe` : identité de contrôle préparée transmise au superviseur.
  Le parcours négatif avait exposé `controlIdentity is not defined` après le
  démarrage du processus. La présence d’un rapport terminal ne suffisait pas
  à prouver sa sortie effective. Le correctif minimal déjà présent dans le
  workspace a été intégré isolément.

Architecture : [ADR 0796](../adr/0796-banc-cooperation-chaine-native.md).
Mode opératoire : [qualification native](qualification-cooperation-chaine-native.md).

## Provenance des exécutions

Racine locale : `D:/GenOS-runs/native-cooperation-20261104-142053`. Chaque campagne
possède sa copie du commit, une base, un catalogue ADN, des capsules et des
temporaires isolés. Les dépendances Node sont réutilisées par jonction ; les
sources exécutées et les états de mission sont sur D:. Les données privées,
les bases et les artefacts générés restent hors Git.

Le modèle est `ollama://qwen2.5-coder:7b`, quantification Q4_K_M, 7,6 milliards
de paramètres. Son empreinte de manifeste est
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Le serveur dédié est `D:/ollama/ollama.exe`, API 0.40.12, modèles sur D:, un
seul appel en parallèle. Le contexte constaté est de 16 384 tokens ; la mesure
`/api/ps` pendant la première campagne indique 5 635 173 252 octets en VRAM.
Ce relevé ponctuel ne mesure pas le pic global de la machine.

Deux chemins Unicode hors du parcours exécuté ont été mal décodés par
l’extracteur Windows dans la première archive. Le constat est conservé dans
l’intégrité des sources ; la préparation finale normalise les chemins et
vérifie un `git diff` vide. Le champ historique `frozenChecksTree` des anciens
fichiers de préparation ne remplace pas le commit de leur archive.

Le binaire Rust immuable `rust/genos-final.exe` a été construit depuis
`56b2ec37859dbfcc731fce6519dda42ec66a2837`. SHA-256 :
`bebb8ee56d2ac640033dc86da33d7de87cdac2dc71f20f7432a18af1b84914d4`.
Les sources Rust et leurs fichiers de dépendances sont identiques dans les
commits suivants de cette qualification ; l’équivalence est enregistrée.

## Première campagne réelle : deux refus justifiés, récupération cassée

Source : `56b2ec378`, répertoire `real-final`.

| Cas | Réponse et conséquence | Appels réels | Tokens | Qualification |
| --- | --- | ---: | ---: | --- |
| Incident `[0,1]` | Somme 13, cible 17, mais `anomaly:false` ; veto natif. Reprise ensuite `unresolved`. | 2 | 8 683 | refusée |
| État sain `[1,4]` | Somme annoncée 13 au lieu de 17, sur les deux tentatives ; veto natif. | 2 | 9 058 | refusée |

La première cause est une observation inexploitable du modèle. La seconde
est une erreur de récupération distincte : le fork écrit sa lignée dans le
workspace parent, puis sa capsule reçoit un autre workspace. L’hydratation
refuse correctement cette incohérence. Le problème n’est plus la conversion
d’échéance : le fork de l’état sain avait encore environ 70 secondes.

Le planificateur, le spécialiste, le vérificateur métier et la restauration
ne sont pas exécutés dans ces deux cas : aucune observation n’a franchi la
porte native. Le bootstrap, l’ADN ResidentDaemon, la clinique, les baux, OMEGA,
les oracles et les décisions de reprise sont effectivement tracés. À la fin,
aucun run actif ni reprise pendante ne subsiste dans les deux bases.

Les missions persistées contiennent les valeurs courantes, les indices, la
cible et les références scellées. Cela ne prouve pas à soi seul le contenu
exact reçu par le fournisseur. La campagne finale capture donc le corps HTTP
transmis, inchangé, sans remplacer la réponse. Les traces brutes restent
privées ; seuls leurs empreintes et un résumé des faits sont publiables.
Des souvenirs GraphRAG hors sujet sont présents dans le contexte ; leur
responsabilité causale dans l’erreur du modèle n’est pas démontrée.

## Essai après correction interrompu avant inférence

Source : `b303a9dee`, répertoire `real-after-fork`. Le daemon rencontre
`MODEL_ROUTE_FAILED` : le serveur dédié n’est plus disponible. Le journal
fournisseur atteste zéro appel et zéro token. Les forks peuvent désormais
être lancés sans l’ancien défaut de scope, mais cela ne qualifie aucun LLM.
Le rapport indique zéro run actif et zéro reprise pendante après arrêt.

Un obstacle externe est identifié : un garde de réservation d’une autre
campagne arrête tout autre serveur Ollama. Il journalise notamment l’arrêt
du nouveau serveur dédié, PID 26760, pendant la tentative de redémarrage.
Ce relevé ne prouve pas directement la cause de l’arrêt du premier PID 37548. Il n’a pas été désactivé sans arbitrage. Les processus encore ouverts
de cet essai ont été arrêtés après conservation du rapport et de leur filiation.

## Campagne finale réelle

La source complète corrigée `169a767fe6cc9aacb6b179803972b8ad256f67ed` est
préparée dans `real-after-fork-verified`. Sa qualification réelle reste **en
attente de ressource** : aucun nouveau résultat Qwen n’est revendiqué.
L’utilisateur a choisi explicitement d’attendre la libération de la réservation
existante. La reprise doit utiliser les scripts préparés et le même binaire
immuable, puis ajouter ici ses réponses, ses coûts et son verdict effectifs.
Le correctif complet n’est donc pas encore qualifié avec le vrai LLM.

## Couverture et séparation des autorités

| Chaîne | Fixtures contrôlées du dernier commit | Première campagne Qwen |
| --- | --- | --- |
| Bootstrap, corps, identité, ADN, clinique, baux, OMEGA | exercés | exercés pour le parent et le daemon |
| Constat et oracles natifs | observation acceptée et fausse observation refusée | observation refusée |
| Planificateur après constat | exécuté, dépendances contrôlées, plan invalide refusé | non atteint |
| Spécialiste et vérificateur distinct | exécutés et vérifiés | non atteints |
| Restauration déterministe | checkpoint restauré en capsule, source inchangée | non atteinte |
| Reprise même identité et fork | réussissent ; substitution native vérifiée pour le fork | mutation tentée ; ancien défaut de lignée au fork |
| Dossier parent et homéostasie | clôture native obtenue | non atteints |

Les sept bases contrôlées sont aussi relues en SQLite : zéro run actif et zéro
reprise pendante pour chacun des cas. Dans `recoverFork`, le registre natif
contient une substitution `verified` portant une référence au reçu du gagnant ;
les deux runs échoués de la source sont toujours présents. L’homéostasie du
banc porte sur son contrat borné ; elle ne certifie pas tous les invariants
possibles de GenOS.

Le daemon constate ; il ne choisit pas la réparation. Le planificateur reçoit
le constat accepté avec les références de son run et de ses oracles. Le
spécialiste propose ; un autre worker vérifie ; le worker de récupération
restaure dans une capsule. Les preuves des enfants remontent par les portes
natives jusqu’au dossier du parent et à la clôture de mission. Aucun succès
HTTP ne remplace une preuve. Une nouvelle identité de reprise conserve le
contrat métier, mais reçoit ses propres admissions signées.

Le vérificateur est indépendant du spécialiste par son identité, son run et
son contrat. Le même petit modèle est cependant utilisé pour les deux ; il
ne s’agit pas d’une indépendance statistique entre modèles. Deux processus
d’oracle natifs contrôlent séparément les postconditions bornées du scénario.
Leur validation ne généralise pas à toute tâche ou tout système réel.

Les génomes cognitifs existants sont ResidentDaemon, PopulationSpecialist et
EvidenceBarrierArbiter. Le worker `restore_checkpoint` est déterministe. Le
parcours séquentiel n’appelle pas une topologie collective A-Team ou Trinity,
une évolution génétique, tous les outils MCP ou une recherche Web. Leur
absence est hors périmètre ; elle ne doit pas être présentée comme une
qualification de « tout GenOS ».

## Validation et ressources

Sur `169a767fe` :

- `python scripts/ci/check_code_quality.py` : 9 039 fichiers, zéro violation.
- Contrôles ciblés : lignée, redispatch, baux, preuves déléguées et coordinateur
  passent ; six tests de capacité de contrôle et la reconnexion signée passent.
- Suite live complète : sept scénarios, code de sortie 0, 493,916 secondes.
  Le transport est une fixture HTTP, les workers et les oracles sont natifs.
- `cargo test --workspace` : code 0 sur les sources Rust de `56b2ec378`,
  identiques à celles du dernier correctif.
- `npm test` : **code 1**, en 493,901 secondes sur le dernier commit. Le scénario
  `mission-local-worker` échoue lors du nettoyage SQLite (`EBUSY`, base fermée,
  événements de reprise `ORCHESTRATOR_NOT_FOUND`). La suite globale reste rouge ;
  le succès ciblé du banc ne la remplace pas.
- Le test de génome worker, précédemment interrompu à 240 secondes, passe
  avec une borne de 600 secondes sur `b303a9dee` ; durée mesurée 70,288 secondes.

| Scénario contrôlé | Verdict attendu et observé | Tokens déclarés par la fixture |
| --- | --- | ---: |
| `success` | qualifié, quatre types, restauration et clôture | 560 |
| `healthy` | qualifié, arrêt sans réparation | 280 |
| `falsePositive` | refus natif ; aucune planification métier | 700 |
| `invalidPlan` | refus des dépendances futures/étrangères/cycliques | 280 |
| `recoverOnce` | qualifié après un échec conservé | 700 |
| `recoverFork` | qualifié après deux échecs et nouvelle identité | 560 |
| `abstention` | refus et arrêt propre, sans planification | 420 |

Ces tokens de fixture ne sont pas des tokens de vrai modèle et ne sont pas
ajoutés au coût empirique Qwen. Aucun de ces cas n’a de run actif ou de reprise
pendante à la lecture finale.

La réserve commune appliquée est de 68 096 tokens, 1 USD fournisseur et
720 000 ms ; chaque worker est borné à 16 000 tokens et 180 000 ms. Les
reprises héritent de l’échéance absolue. L’allocation nominale de 64 000 tokens
workers n’est pas un second plafond collectif appliqué séparément. Les coûts
proviennent du journal fournisseur, parent et enfants inclus, échecs compris.
La première campagne consomme 17 741 tokens réels. L’essai d’infrastructure suivant ajoute zéro token ; la campagne finale
attendue n’a encore consommé aucun token.
Le coût fournisseur local de 0 USD ne couvre ni matériel ni électricité.
Ces quelques observations ne démontrent pas encore une efficacité générale.

## Preuves conservées

Le manifeste local initial `manifest-avant-relance.json` scelle les archives,
le binaire, les rapports, audits, journaux et résultats des checks. Il exclut
les répertoires privés et les traces HTTP brutes. Les rapports contrôlés sont
dans `tmp/genos-cooperation-live-test-JvdPlE`, avec un `audit.json` relisant les
bases. Les rapports réels et audits sont dans `real-final` ; le refus
d’infrastructure est conservé dans `real-after-fork`. La reprise préparée est
décrite dans `qualification-resume.json`. Un manifeste final séparé devra être
produit après la qualification en attente.

Le workflow de développement GenOS a conservé les mémoires d’échec, deux
snapshots, les diagnostics, décisions et expériences. Snapshot initial :
`snap-610eac43dcfa49a38b3158da86551431` ; snapshot de récupération :
`snap-62c9cbe18ca44ae99f49320dec026b9b`. Une expérience négative supplémentaire
`e6138e14-20b6-4500-86d9-0b3a14d07b3d` conserve le défaut de supervision et
le conflit d’infrastructure. Leur persistance ne certifie pas le résultat.
