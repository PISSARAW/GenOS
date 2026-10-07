# Trois pilotes comparatifs P0, version 1

Protocole exploratoire exécutable : micro-correctifs numériques, rappel de
mémoire et preuves Lean. Les données synthétiques sont écrites pour ce dépôt,
versionnées et contrôlées par SHA-256 dans `dataset.lock.json`. Elles ne
représentent ni SWE-bench, ni une population de tâches IA, ni les six suites
du registre scientifique existant.

## Séparation et budgets

Chaque pilote contient 2 tâches d'apprentissage avec exemples, 2 tâches de
développement et 8 tâches réservées. Seuls les exemples d'apprentissage sont
injectés dans les prompts. Les tests publics servent à la sélection ; les
oracles réservés, références et canaris sont conservés dans `evaluation/` et
lus après collecte. Le modèle ne dispose d'aucun outil ni accès au dépôt.
La calibration vérifie les références sur les oracles, sans appeler le modèle.

Le protocole impose le même modèle local, contexte, température, nombre de
requêtes, plafonds de sortie et délais à tous les bras d'un pilote. Les
options natives sont transmises effectivement à Ollama (`seed`, `temperature`,
`num_ctx`, `num_predict`) selon son [contrat officiel](https://github.com/ollama/ollama/blob/main/docs/api.md?plain=1).
L'usage publié provient des compteurs natifs, jamais d'une estimation substituée.

| Pilote | Requêtes par tâche et bras | Sortie maximale par requête | Vérifications publiques maximales |
| --- | --- | --- | --- |
| Code | 2 | 256 tokens | 2 |
| Mémoire | 1 | 128 tokens | 0 |
| Raisonnement | 2 | 384 tokens | 2 |

Contexte : 4 096 tokens, température 0, inférence 120 secondes, vérification
30 secondes, cas 300 secondes. Une campagne réservée comprend 160 requêtes
scorées et une chauffe prédéfinie de 32 tokens ; elle produit 96 résultats.
Les deux campagnes utilisent les graines prédéclarées 801 puis 802. Les coûts
et délais réalisés peuvent différer et sont rapportés séparément. Les blocs
mémoire sont complétés par des espaces jusqu'à 2 048 octets UTF-8 : cela
égalise les octets, pas exactement les tokens.

## Bras et ablations

Pour le code et Lean :

- `direct` : seconde proposition après auto-révision, sans retour du vérificateur.
- `tool-assisted` : révision séquentielle avec retour public, sélection du
  premier candidat vérifié. Ce bras sert également d'ablation sans candidats
  indépendants ; il n'est pas compté deux fois.
- `genos` : deux prompts indépendants, espaces de vérification distincts,
  sélection du premier candidat vérifié, abstention sinon.
- `no-evidence-gate` : mêmes candidats indépendants et vérifications, mais
  sélection du dernier candidat, même lorsqu'il n'est pas vérifié.

Le bras `genos` exerce réellement l'adaptateur AEIS de tests et le gate Lean
incrémental. Il s'agit d'un scaffold borné de composants GenOS ; ce runner
n'exécute pas une mission autonome ni l'API de bifurcation des lignées d'agents.
Les expressions JavaScript passent par une grammaire restrictive avant la VM.
Les en-têtes des théorèmes sont imposés ; les commandes Lean dangereuses,
`sorry` et les axiomes ajoutés sont refusés, puis les axiomes noyau audités.

Pour la mémoire : `raw-memory` expose le corpus brut, `genos` utilise les
vraies écritures/retrieval/formatage avec embeddings déterministes explicites,
`no-trust-boundary` garde les mêmes identifiants récupérés en rétablissant le
contenu source original, et `no-retrieval` supprime ce contexte. Les quatre
mémoires de fond prédéfinies du runtime sont aussi disponibles au baseline
brut. Les tâches réservées couvrent quatre rappels propres et quatre notes
adversariales face à des registres courants faisant autorité.

## Exécution et reproduction

Définir `GENOS_LEAN_EXECUTABLE`, `PILOT_OPERATOR_ID`, `TEMP` et `TMP`. Les bases
sont créées exclusivement dans des répertoires temporaires propres ; `.env`
est désactivé avant d'importer les services. Ne jamais fournir une base réelle.

```text
python benchmarks/p0-pilots/v1/calibrate.py <calibration.json> <node-exe> <lean-exe>
node benchmarks/p0-pilots/v1/smoke.cjs <smoke.json>
node benchmarks/p0-pilots/v1/run.cjs dev <sortie-dev>
python benchmarks/p0-pilots/v1/evaluate.py <sortie-dev>
node benchmarks/p0-pilots/v1/freeze.cjs <capsule>
node <capsule>/benchmarks/p0-pilots/v1/run.cjs dev <preflight> <capsule>/frozen-manifest.json 0
node <capsule>/benchmarks/p0-pilots/v1/run.cjs holdout <primaire> <capsule>/frozen-manifest.json 0
python <capsule>/benchmarks/p0-pilots/v1/evaluate.py <primaire>
```

Un autre opérateur exécute ensuite la même capsule dans un nouveau processus,
avec une sortie neuve et l'indice 1, sans lire les scores primaires ni changer
les prompts. Conserver son reçu de mission ou de délégation : changer seulement
`PILOT_OPERATOR_ID` ne démontre aucune indépendance de l'opérateur.

```text
node <capsule>/benchmarks/p0-pilots/v1/run.cjs holdout <reproduction> <capsule>/frozen-manifest.json 1
python <capsule>/benchmarks/p0-pilots/v1/evaluate.py <reproduction>
python <capsule>/benchmarks/p0-pilots/v1/compare-reproduction.py <primaire> <reproduction> <comparaison.json>
```

La capsule copie les sources et épingle leurs empreintes, le modèle, Node et
Lean (exécutable, bibliothèques dynamiques et modules). Les dépendances restent
liées à l'installation locale, en lecture seule par convention ; leur contenu
est vérifié avant et après chaque collecte. Cela n'est pas une immutabilité
imposée par le système d'exploitation. Aucun secret ni base n'est copié.
Une sortie existante n'est jamais écrasée. Tous les échecs, délais et abstentions
restent au dénominateur ; une allocation incomplète invalide la comparaison.

L'adjudicateur Python reconstruit ses références numériques, impose lui-même
les théorèmes et invoque Lean directement. Le scoreur ne reçoit ni le nom du
bras ni l'identité du modèle. Le code candidat utilise le parseur borné commun
pour l'exécution, mais jamais le scoreur AEIS. Les contrastes sont appariés par
tâche, avec intervalles bootstrap descriptifs et test exact de discordance.
Les neuf contrastes sont exploratoires ; un plafond sur huit tâches peut
produire un intervalle dégénéré. Les répliques ne sont pas fusionnées pour
gonfler l'échantillon. Une reproduction sur le même hôte et modèle ne vaut pas
une reproduction par un laboratoire externe ni un gain général de capacité.

Les résultats, prompts et reçus produits restent hors Git. Consulter le
[rapport de qualification](../../../docs/06-qualite-preuves/qualification-trois-pilotes-comparatifs-2026-10-07.md)
pour les exécutions effectivement réalisées et leurs limites. Aucun score ne
remplace les preuves requises pour une promotion en production.
