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

La campagne Qwen2.5 14B V3 termine 300 transformations et 970 appels avec une
identité conforme aux seuils, dix sondes de descendants et trois sondes à froid
correctes. Les huit règles conservées sont correctes, mais le transfert reste à
24/96, les inconnus reconnus à 25 % et le Brier à 0,71875 : verdict négatif vérifié.

La V4 présente directement le littéral et les opérations, avec les positions des
caractères de l'entrée originale. Le LLM peut écrire ses calculs dans `reasoning`
avant `answer` ; ces tokens restent dans le plafond total de 2 048. Le budget natif
de raisonnement reste à 256. Les propositions de règles gardent leurs portes
d'identifiabilité et de validation. Les motifs de deux chiffres utilisent `[0-9]`,
pris en charge par le décodeur, au lieu de l'échappement `\d` qu'il ignorait.
Le journal conserve aussi la requête complète et son schéma, reconstruits au rejeu.
Le schéma d'identité, les poids, le corpus, les plafonds et les scores ne changent pas.
Ce correctif de présentation n'est pas une garantie de capacité du modèle.

La dérivation du feedback et la proposition précèdent le raisonnement sur le
problème courant : une opération actuelle inconnue n'empêche pas d'apprendre
l'opérateur du feedback précédent. Les chemins d'identité sont explicitement
des listes de nœuds, avec un singleton pour soi-même ; schéma et score restent
inchangés et toute réponse vide incorrecte reste une erreur.

`node diagnose-application.cjs DOSSIER-NOUVEAU SOURCE-REFERENCE-FIGEE` compare
l'interface actuelle à une référence locale sur 40 tâches appariées et 80 appels.
Les modèles et critères doivent être identiques. Une nouvelle graine et les
définitions correctes sont scellées avant les réponses ; l'oracle ne note qu'après
journalisation de la réponse brute. Ces définitions fournies isolent l'application
de l'acquisition des règles : ce diagnostic ne constitue **jamais** une preuve
d'apprentissage. Les réponses et tous les échecs restent conservés.

L'oracle garde un processus séparé par worker, disponible avant les appels LLM.
Il reçoit chaque tâche uniquement après journalisation de la réponse brute. Le
démarrage et chaque requête restent bornés à cinq secondes ; aucun timeout,
processus mort ou résultat mal corrélé n'est repris. Son calcul, le score et le
plafond global de quatre heures ne changent pas. `test-oracle-client.cjs` vérifie
le transport réel, ses erreurs et son absence de nouvelle tentative.
