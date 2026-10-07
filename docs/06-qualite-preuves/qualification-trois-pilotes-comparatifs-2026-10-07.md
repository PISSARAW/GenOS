# Qualification des trois pilotes comparatifs P0

Date : 2026-10-07. Lot B05, distinct de la clôture B06.

## Protocole livré

Le [runner versionné](../../benchmarks/p0-pilots/v1/README.md) livre trois
cohortes synthétiques : micro-correctifs numériques, rappel mémoire et preuves
du noyau Lean. Chacune sépare deux exemples d'apprentissage, deux cas de
développement et huit cas réservés. Les quatre bras de chaque pilote incluent
baselines et ablations, avec les mêmes plafonds de requêtes, contexte, sortie,
délais et vérifications publiques. Tous les échecs restent au dénominateur.

Le modèle local est `qwen2.5-coder:7b`, empreinte
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Les graines de campagne 801 et 802, température zéro et contexte 4 096 tokens
sont fixés avant le réservé. Les compteurs natifs mesurent l'usage réel.
Les contrôles par cas sont décrits dans `protocol.json`, sans modification
après le gel des sources. L'[ADR 0348](../adr/0348-trois-pilotes-comparatifs-reproductibles.md)
explicite les choix et limites.

La sélection n'utilise que les contrôles publics. Après collecte, un oracle
Python distinct reconstruit les références numériques et les théorèmes Lean,
sans appeler le scoreur GenOS et sans transmettre le nom du bras au scoreur.
Il conserve toutes les réponses, abstentions et réfutations. Les tests privés
et leurs canaris ne sont jamais injectés dans les prompts du modèle.

## Précontrôles exécutés

Le premier développement a produit 24 résultats et 41 appels incluant la
chauffe, sans erreur de transport ni dérive. Les huit bras code/mémoire
obtiennent tous 2/2 ; les quatre bras de raisonnement obtiennent chacun 1/2.
Ces résultats historiques restent conservés, mais le premier développement
Lean utilisait la liaison d'instrumentation défectueuse décrite ci-dessous.

Trois capsules initiales ont échoué avant toute inférence réservée : leur
périmètre omettait respectivement un module `backend/bin`, un schéma protobuf
et les politiques Cedar. Ces échecs sont conservés ; aucun contrôle de sécurité
n'a été retiré. La quatrième capsule comprend 3 230 fichiers source et
8 015 fichiers de dépendances, plus les empreintes Node, modèle et modules/
bibliothèques Lean. Ses sondes réelles AEIS, mémoire et gate Lean passent.
L'adjudicateur indépendant accepte les 36 références et refuse les quatre
contre-exemples, soit 40 contrôles, avec zéro appel au modèle.

Empreinte du manifeste gelé :
`2dad8100dd4579520e69848fdd3e8d9e6cecde9f415491bc0f7b45d2f27566fa`.
Les sources sont copiées ; les dépendances sont liées à l'installation locale
et contrôlées par empreinte avant/après. Il n'existe pas d'immutabilité imposée
par le système d'exploitation. Aucun `.env`, secret ni base réelle n'est copié.

## Amendement d'instrumentation

La première campagne réservée, `primary-v1`, a terminé ses 161 appels et
96 résultats, sans erreur de transport ni dérive. Une preuve multiligne
correcte sur la tâche d'apprentissage `reasoning-00-add_zero` reproduit ensuite
une réfutation indue : l'ajout d'indentation faisait interpréter `rfl` comme
un argument de `intro`. Cette campagne est conservée et déclarée invalide
dans `qualification-invalid.json`, **avant lecture de ses scores réservés**.

Le correctif conserve intégralement le bloc `by` sous l'en-tête imposé.
Une sonde réelle vérifie désormais les deux formes de preuve, avec ligne
unique et plusieurs lignes ; le contrat interdit toujours `sorry` et les
commandes dangereuses. `amend.cjs` construit une nouvelle capsule depuis
l'original, sans reprendre les modifications du checkout partagé. Il n'autorise
que trois écarts : liaison Lean, sonde et script d'amendement.

Empreinte du manifeste amendé :
`59a452dc4e83632d3ef9b06c8437f89c4d904b1a04c3b6364c588735b9d893b3`.
Les jeux, prompts, modèle, budgets, règles de sélection, dépendances et outils
sont identiques. Aucune adaptation n'utilise les réponses ou labels réservés.
Cet amendement est transparent ; les nouvelles campagnes demeurent des
comparaisons exploratoires et ne constituent pas un essai confirmatoire.

## Campagnes réservées et reproduction

Deux campagnes admissibles ont terminé, sous le manifeste amendé identique :
`primary-amended-v1`, opérateur `codex-primary`, graine 801, processus 24332 ;
`independent-codex-v1`, opérateur `codex-independent-reproduction`, graine 802,
processus 27848. Chacune produit **96 résultats, 160 appels scorés mesurés et
une chauffe**, ainsi que 96 reçus d'oracle. Collecte, adjudication et comparaison
sortent avec le code 0. Aucune erreur de transport, fuite de canari, dérive de
source ou de dépendance n'est détectée. Les abstentions restent des échecs.

La collecte primaire termine à 07:48:31 UTC ; l'indépendante à 08:05:59 UTC.
Un autre agent Codex a reçu la capsule et les instructions d'exécution avec
`fork_turns: none`, sans historique parental ni scores primaires. Il a lancé
ses propres processus et bases temporaires, puis l'oracle gelé après collecte.
Son reçu conserve les commandes, heures, sorties et empreintes. Le parent a
recalculé toutes ces empreintes et conservé le reçu de délégation.

Cette indépendance est celle d'un **opérateur IA distinct via collaboration**,
sur le même hôte et modèle. Elle ne démontre ni un laboratoire externe, ni
un runtime Codex séparé au niveau du système d'exploitation. Deux tentatives
`genos_orchestrate` précédentes sont conservées : la première échoue sur une
erreur de syntaxe du backend ; la seconde renvoie un texte vide, sans mission
ni artefact attesté. Aucune n'est comptée comme reproduction réussie GenOS.

| Pilote | Bras | Primaire | Reproduction | Tokens primaire entrée / sortie | Tokens reproduction entrée / sortie |
| --- | --- | --- | --- | --- | --- |
| code | `direct` | 8/8 | 8/8 | 4250 / 260 | 4250 / 260 |
| code | `tool-assisted` | 8/8 | 8/8 | 4394 / 260 | 4394 / 260 |
| code | `genos` | 8/8 | 8/8 | 3984 / 257 | 3984 / 257 |
| code | `no-evidence-gate` | 7/8 | 7/8 | 3984 / 257 | 3984 / 257 |
| memory | `raw-memory` | 7/8 | 7/8 | 3804 / 125 | 3804 / 125 |
| memory | `genos` | 8/8 | 8/8 | 5329 / 124 | 5329 / 124 |
| memory | `no-trust-boundary` | 7/8 | 7/8 | 3415 / 125 | 3415 / 125 |
| memory | `no-retrieval` | 8/8 | 8/8 | 2642 / 124 | 2642 / 124 |
| reasoning | `direct` | 0/8 | 1/8 | 3268 / 280 | 3256 / 256 |
| reasoning | `tool-assisted` | 0/8 | 1/8 | 3949 / 276 | 3843 / 256 |
| reasoning | `genos` | 0/8 | 1/8 | 2936 / 304 | 2936 / 296 |
| reasoning | `no-evidence-gate` | 0/8 | 0/8 | 2936 / 307 | 2936 / 293 |

Le primaire consomme **44 891 tokens d'entrée et 2 699 de sortie**, soit
47 590 tokens scorés ; la reproduction **44 773 et 2 633**, soit 47 406.
Ces compteurs excluent la chauffe, conservée séparément dans `warmup.json`.
Les 160 appels scorés de chaque campagne ont des compteurs natifs mesurés.
Les plafonds sont identiques ; les coûts réels diffèrent, notamment à cause
du formatage de confiance mémoire. Le bras mémoire GenOS utilise 5 453 tokens
par campagne, contre 2 766 sans retrieval : aucun gain d'efficience n'est
revendiqué. Les latences figurent dans les résumés ; la machine partagée ne
permet aucune conclusion de vitesse à charge exclusive.

La comparaison retrouve **89 sélections identiques sur 96** (candidats structurés ou abstentions) et
**93 verdicts identiques sur 96**. Les trois écarts de verdict concernent
`reasoning-06-compose`, réussi seulement par la reproduction dans les bras
`direct`, `tool-assisted` et `genos`. Les deux campagnes diffèrent donc
sur certains résultats même à température zéro ; aucune relance motivée par le
score n'est effectuée. Les deux campagnes restent analysées séparément.

## Résultat et limites scientifiques

Le lot B05 est clôturé pour ces trois **pilotes exploratoires bornés** : données
et jeux réservés versionnés, baselines, ablations, budgets contrôlés, oracle
distinct, collecte réelle et reproduction aveugle attestée. La réussite de
ce protocole ne signifie pas la réussite des capacités mesurées.

- **Code** : GenOS égale `direct` et `tool-assisted` à 8/8. Le bras sans gate
  sélectionne une réponse non vérifiée et obtient 7/8 dans les deux campagnes.
  Aucune supériorité des candidats indépendants sur la révision séquentielle
  n'est démontrée.
- **Mémoire** : GenOS et l'ablation sans retrieval font tous deux 8/8. Les
  registres courants faisant autorité suffisent à résoudre ces tâches sans
  mémoire. Les bras brut et sans frontière de confiance suivent chacun une
  note adversariale et font 7/8. Cette cohorte observe une résistance à la
  contamination ; elle ne démontre aucun bénéfice du retrieval, du rappel
  latent ou d'une mémoire durable pour l'IA.
- **Raisonnement** : GenOS fait 0/8 puis 1/8, comme les deux baselines. GenOS
  et `tool-assisted` s'abstiennent respectivement huit puis sept fois et ne
  publient aucune sélection non vérifiée. `direct` en conserve huit puis sept,
  le bras sans gate huit dans chaque campagne. Le modèle échoue largement ;
  les gates filtrent ces sorties sans prouver un gain de raisonnement.

Tous les tests exacts de discordance de ces neuf contrastes par campagne
donnent `p = 1`. Les contrastes avec une seule victoire affichent une différence
appariée de 0,125 et un intervalle bootstrap descriptif [0 ; 0,375] ; les
égalités donnent [0 ; 0]. Ces intervalles au plafond sur huit tâches ne sont
pas une garantie de généralisation. Aucun résultat n'autorise une promotion
ni une affirmation d'amélioration générale de l'IA.

## Validation du dépôt et mémoire d'expérience

Sur l'état natif partagé du dépôt, les vérifications finales sont terminées :

- `python scripts/ci/check_code_quality.py` : 5 380 fichiers, 104 violations
  historiques admises, **0 nouvelle**, code 0 (`quality-native-v4.log`).
- `npm test` : suite complète, code 0 (`npm-full-v4.log`), incluant le mock
  HTTP des options natives et les contrats des pilotes. Le journal conserve
  un avertissement `SQLITE_MISUSE` lors d'un poll après fermeture ; la suite
  concernée et le processus global terminent avec succès.
- `cargo test --workspace` : **673 tests, 80 suites, 0 échec, 0 ignoré**,
  code 0 (`cargo-workspace-v3.log`), target sur D: et debug/PDB désactivé.

Les précontrôles ont aussi conservé les calibrations, sondes AEIS/mémoire/Lean
et les deux preuves d'apprentissage Lean valides. Les premiers échecs de suite
sur des fichiers modifiés simultanément restent dans les journaux. Les
réparations nécessaires du backend ont été ciblées ; les autres modifications
du checkout partagé ne sont pas incluses dans les commits des pilotes.

GenOS confirme l'expérience `d92512d1-dd35-4565-8a50-349f04f75bda` et
la compilation de 14 mémoires. Les reçus sont conservés. Cette persistance
enregistre les observations ; elle ne certifie pas le verdict scientifique.

## Portée de l'interprétation

Les bras GenOS utilisent réellement AEIS, le pipeline mémoire et le gate Lean,
mais le runner ne représente pas une mission autonome ni l'API de fork des
lignées. Le baseline mémoire brut dispose du même corpus de fond prédéfini.
Le remplissage des blocs mémoire égalise 2 048 octets, sans égalité exacte de
tokens. Les consommations réalisées et cette limite sont publiées.

Huit tâches écrites pour le dépôt et un seul modèle local ne permettent pas
une conclusion représentative sur les capacités IA. Les neuf contrastes
appariés par campagne sont exploratoires ; leurs intervalles bootstrap peuvent
être dégénérés au plafond. Les répétitions ne sont pas fusionnées en nouvelles
tâches indépendantes. Le protocole est distinct des six suites scientifiques
et ne remplace aucune preuve requise pour une promotion en production.

## Artefacts

Les journaux, prompts, réponses, manifestes, contrôles et scores sont conservés
hors Git dans le dossier local
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/b05`.
Les données du protocole et les oracles synthétiques sont versionnés ; les
résultats générés et bases restent exclus des commits.

## Empreintes des résultats

SHA-256 des fichiers, distinct de l’empreinte canonique du manifeste :

| Artefact sous le dossier B05 | SHA-256 |
| --- | --- |
| `primary-amended-v1/responses.jsonl` | `57fb8191f65c54b70b194df12454ef2e7a3c347eac8ca77ae298b281b33eaa0a` |
| `primary-amended-v1/summary.json` | `b15ec9cdc9f43452507e283b064a546e10fc6c23addb056384c6d5ff824a6569` |
| `independent-codex-v1/responses.jsonl` | `fcac9971e5052e70eef77dbabeb184d99c1b60c247ca961af1d8578fc28fb7eb` |
| `independent-codex-v1/summary.json` | `02be55b998b49c2a06dc7f3adce6bbcc4913542f61817814b5a7e09ba1cfbca1` |
| `independent-codex-v1/operator-receipt.json` | `882d1f17e448d8dbe7b22e1cfaba52f9370745339824ad22a44b40f8c80c121d` |
| `independent-delegation-receipt.json` | `69daae1a268eaf83bdce61ea358c745948b9433e39721337b7bd2890b15dc66a` |
| `reproduction-comparison.json` | `e59b415bc0f0c7c8f4a964393ab0e181608f20315ab75bd78f54e3ad9642b885` |

Le fichier `qualification-evidence.json` rassemble les compteurs et les empreintes
des reçus d’oracle, manifestes et journaux de validation.
