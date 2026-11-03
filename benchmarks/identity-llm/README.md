# Campagne longitudinale avec un LLM local réel

Ce harness conserve la référence de la campagne locale du 2 novembre 2026 :
300 transformations, 970 inférences principales et trois fenêtres de transfert.
Le protocole, les sources GenOS figées et le modèle GGUF sont déclarés dans
`protocol.json`. Les fichiers d'exécution restent sur D: et ne sont pas versionnés.

La référence a **échoué** aux critères de filiation et d'apprentissage :
identifiant et mandat 300/300, parenté 144/300, descendants entièrement corrects
0/10, transfert 22/96 contre 0/96 pour chaque contrôle. Le vérificateur a confirmé
le journal et les métriques. Ce résultat ne qualifie pas tous les modèles GenOS.

Depuis ce répertoire : `node test.cjs` vérifie le harness sans simuler une preuve
LLM. `node run.cjs D:/GenOS-runs/identity-llm/NOUVEAU-DOSSIER` lance une campagne
réelle, sans reprise ni écrasement d'un dossier existant. `node verify.cjs DOSSIER
EMPREINTE-MANIFESTE` rejoue les contrôles hors ligne. Conserver l'empreinte affichée
avant les premières observations. Les réponses brutes restent celles notées.

Il s'agit d'un cas fonctionnel à mémoire externe et poids fixes. Les cycles sont
dépendants, les fenêtres ne sont pas des lignées indépendantes et les bornes
d'identité servent de référence au protocole. Aucune promotion de production
n'est autorisée par ce benchmark.

La version corrigée utilise le contexte de reconnaissance causal du runtime et
des propositions de règles typées du LLM. Seules les règles identifiables qui
reproduisent les exemples d'entraînement sont activées. Une proposition fausse
reste auditée ; un contre-exemple révoque une règle active. Voir
[ADR 0771](../../docs/adr/0771-filiation-verifiee-et-regles-apprises-validees.md).

`baseline-criteria.json` fixe les critères de la référence. `config.cjs` rejette
tout changement des seuils, plafonds, corpus et règles d'arrêt. Le SHA historique
reste conservé ; `model-profile.json` fige séparément Qwen2.5 14B, choisi explicitement
par l'utilisateur le 3 novembre 2026 avant toute réponse confirmatoire. Ce changement
de modèle modifie une condition expérimentale, sans abaisser les critères.
Les racines de code vides dans `protocol.json`
désignent le dépôt courant ; une copie figée sur D: déclare ses racines absolues
avant le scellement. `node pilot.cjs DOSSIER [CYCLES]` lance uniquement un pilote de
développement (24 cycles par défaut, de 1 à 50, puis une fenêtre), dont les résultats ne qualifient jamais
la campagne complète. Chaque campagne confirmatoire utilise une nouvelle graine.

La campagne V2 a terminé les mêmes 300 transformations et 970 appels : les
critères d'identité passent, avec parenté 298/300, descendants 10/10 et sondes à
froid 3/3. Les huit règles conservées sont correctes, mais leur application brute
reste à 26/96 contre 0/96 pour chaque contrôle. La preuve complète échoue donc.

La V3 présente l'entrée littérale caractère par caractère dans son ordre initial.
Elle récupère les seules règles utiles au problème et les compile en une
expression symbolique non évaluée. Les instructions d'application sont propres
à la famille ; le LLM évalue l'expression et produit sa réponse brute. Aucun
produit, caractère inversé, résultat de casse ou réponse n'est calculé dans ce
plan. Le programme est présenté directement au modèle ; les deux messages exacts
envoyés au serveur sont journalisés et reconstruits au rejeu. Les variables de
travail scalaires sont produites par le LLM dans le même appel que la réponse.
Un intermédiaire correct ne remplace jamais une réponse finale fausse. Le schéma ne
contraint pas la réponse au résultat attendu. Les seuils,
budgets, corpus et contrôles restent ceux de la référence. Les poids de Qwen2.5 14B
sont figés pour toute la nouvelle campagne. Voir
[ADR 0774](../../docs/adr/0774-application-llm-par-traces-litterales.md).
