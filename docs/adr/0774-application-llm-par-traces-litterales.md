# ADR 0774 — Application LLM par expressions symboliques

**Statut** : Accepté
**Date** : 2026-11-03
**Domaine** : Ontogenèse, application de règles, qualification LLM
**Lié à** : [ADR 0771](0771-filiation-verifiee-et-regles-apprises-validees.md), [Harness LLM](../../benchmarks/identity-llm/README.md)

## Contexte

La campagne V2 complète passe les critères d'identité, avec 298/300 chemins et
relations corrects, dix sondes de descendants et trois sondes à froid entièrement
correctes. Le vérificateur confirme les huit règles admises. L'application brute
reste pourtant à 26/96, contre 0/96 pour les deux contrôles. Les trois fenêtres
restent entre 25 % et 28,125 %, sous le seuil inchangé de 80 %.

Les premières variantes de développement avec traces détaillées régressent :
3/32 contre 7/32 pour les colonnes décimales, puis 1/32 contre 8/32 pour les sommes
et assemblages en listes. Le modèle recopie parfois une entrée dans tous les
postes ou ferme une liste après un terme ; des assemblages atteignent la limite
inchangée de 2 048 tokens. Une structure JSON plus détaillée ne garantit pas une
exécution sémantique correcte. Ces pilotes négatifs restent conservés sur D:.

## Décision

Le plan fournit la valeur littérale et ses caractères dans l'ordre original.
Cette segmentation est réversible. Les règles récupérées sont uniquement celles
nommées dans le problème courant. Les autres connaissances restent dans la mémoire
durable ; elles ne distraient plus l'application présente.

Le runtime compile ces règles en une expression symbolique **non évaluée**.
Une règle affine émet les coefficients, l'entrée et les parenthèses de l'expression
arithmétique. Une règle textuelle émet les opérations Python `"".join`, `[::-1]`,
`.upper()` et `+` correspondant aux paramètres appris. Les compositions emboîtent ces
expressions. Un opérateur manquant propage une expression inconnue.

Le compilateur produit seulement du texte de programme. Il n'exécute aucune
addition, multiplication, inversion, casse ou concaténation de résultat. Les
littéraux numériques proviennent uniquement des entrées et règles ; les caractères
initiaux gardent leur ordre d'origine. Aucun oracle, résultat attendu ou proposition
de réparation n'entre dans cette compilation.

Les instructions d'évaluation sont courtes et propres à la famille. Le programme
présente les affectations dans l'ordre : produit ou corps textuel, puis application
de l'offset ou de l'encadrement, pour chaque opérateur. Le LLM renseigne ces quelques
variables scalaires dans `working`, puis sa réponse et sa confiance. Les variables
extérieures dépendent explicitement des résultats intérieurs. La dérivation des paramètres
depuis le feedback reste structurée dans les tours d'apprentissage. Les portes
d'admission, de rejet et de révocation ne changent pas.

Le message utilisateur présente directement le programme, sans le réencoder dans
une chaîne JSON accompagnée de métadonnées redondantes. Le feedback est ajouté
seulement pendant l'apprentissage et identifié comme provenant du tour précédent.
Les deux messages exacts envoyés au serveur sont conservés dans le journal et
reconstruits au rejeu. Le transport des requêtes d'identité reste inchangé. Les
paramètres de génération, budgets, caches et poids ne changent pas.

Les schémas laissent la réponse libre. À famille identique, modifier entrées et
règles ne contraint pas la génération au résultat attendu. Le score utilise la
réponse brute du modèle, sans calculatrice, substitution, sélection par oracle,
nouvelle tentative ou correction après réception. Tous les contrôles utilisent
la même compilation avec leur propre mémoire, y compris les règles permutées.

## Validation et portée

Les tests vérifient la réversibilité de la vue littérale, l'absence de règles
inutilisées dans le prompt, la conservation des littéraux dans le programme, la
liberté des réponses et la persistance des erreurs brutes au score. Le vérificateur
reconstruit la sélection et la compilation depuis la mémoire relue ; il ne fait pas
confiance au programme journalisé seul.

Les comparaisons de développement avec définitions fournies testent seulement
l'application et ne prouvent pas un apprentissage. Les essais négatifs et les
échecs techniques sont conservés dans des dossiers distincts.

Après commit et gel des sources, une nouvelle graine alimente la campagne complète.
Les 300 transformations, 970 appels principaux, corpus, contrôles, poids, seuils et
budgets restent identiques, dont 256 tokens de raisonnement et 2 048 de sortie.
Le vérificateur et les trois sondes à froid restent obligatoires.

Le périmètre concerne un agent GenOS avec mémoire externe, récupération ciblée et
compilation symbolique. Il ne qualifie pas un LLM sans ces services. La correction
reste une hypothèse expérimentale jusqu'au résultat complet ; aucune promotion
de production n'est autorisée par ce changement.

## Profil de modèle du 3 novembre 2026

Après les pilotes 8B négatifs, l'utilisateur choisit explicitement Qwen2.5 14B
local sur D:. Le profil GGUF Q4_K_M de 14,8 milliards de paramètres est conservé
dans `model-profile.json` avec son SHA-256. Le SHA historique du modèle R1 reste
dans la référence. Les 25 autres champs protégés — seuils, corpus, plafonds et
arrêt — sont comparés sans exception. Le modèle ne change plus après scellement.
Cette campagne qualifie une nouvelle condition de modèle ; elle n'isole pas à
elle seule l'effet causal du correctif à poids constants.

## Diagnostic et révision V4

La V3 avec Qwen2.5 14B termine les 300 transformations et 970 réponses. Les huit
règles admises concordent avec le monde indépendant ; l'application réussit
seulement 24/96 tâches connues, avec 25 % d'inconnus reconnus et un Brier de
0,71875. L'identité et les sondes de filiation passent. Le vérificateur confirme
ce résultat négatif.

Les diagnostics contrôlés sur D: fournissent les définitions correctes aux deux
variantes pour isoler l'application. Ils ne prouvent pas un apprentissage. Le
template conserve les littéraux exacts. Désactiver le cache ne rétablit pas
l'exactitude. Le raisonnement générique, le schéma complet dans le contexte,
les traces de caractères, l'assemblage progressif et les décodages Unicode ou
par tokens d'un caractère restent insuffisants. Une trace peut contenir les
bons caractères et être suivie d'une réponse finale tronquée ; la certitude
déclarée reste parfois maximale. Il serait faux d'attribuer tous ces échecs à
une corruption du registre ou de la mémoire.

La présentation directe du littéral et des opérations avec un calcul libre avant
la réponse est retenue comme adaptation plus simple. Sur les petits diagnostics,
les quatre cas numériques réussissent avec calculs intermédiaires, contre zéro
sans eux ; les tâches textuelles restent difficiles. Cette observation n'est pas
une garantie d'atteindre les seuils de la campagne complète. Un nouveau corpus
de développement complet compare les interfaces avant le gel confirmatoire.

Ce comparatif complet apparié avec définitions fournies termine ensuite 80 appels
sur une nouvelle graine scellée : 27/32 réponses connues correctes contre 8/32 pour
la V3, dont 16/16 numériques et 11/16 textuelles ; les inconnus passent de 0/8 à
8/8. Il confirme un effet de l'interface à modèle et corpus constants, sans
isoler un mécanisme unique. Les cinq erreurs textuelles résiduelles interdisent
de présenter l'adaptation comme une correction garantie de toutes les capacités
du modèle. Le pilote avec acquisition réelle et la campagne complète restent
nécessaires ; les définitions fournies ne comptent jamais comme des règles apprises.

Un premier pilote d'acquisition s'interrompt après cinq cycles complets et douze
réponses brutes sur `ORACLE_FAILED`, sans code détaillé dans l'ancien message.
Il reste conservé comme échec technique, sans reprise ni qualification. Dix
invocations isolées du même oracle réussissent ensuite entre 170 et 479 ms sous
le plafond inchangé de cinq secondes ; elles ne suffisent pas à identifier la
cause initiale. Le message d'erreur conserve désormais code, statut et signal du
sous-processus. Ni le calcul d'oracle ni son timeout ne changent. Un pilote
distinct est exécuté avant la campagne confirmatoire.

Ce second pilote termine 24 cycles et 168 réponses, sans sortie invalide. Il
conserve six règles et réussit 14/32 tâches connues : il révèle que le raisonnement
sur un problème courant inconnu peut faire déclarer le feedback précédent
« sans rapport » et empêcher son apprentissage. La dérivation structurée puis
la proposition sont donc replacées avant le raisonnement d'application. La
consigne distingue explicitement ces deux tâches indépendantes. Sur les premiers
feedbacks éligibles des huit opérateurs, le comparatif contrôlé passe de 3/8 à
5/8 règles correctes ; chaque proposition admise concorde avec le monde caché.
Les autres propositions restent rejetées, sans réparation.

Les trois erreurs de chemin de ce pilote concernent la cible soi-même : le modèle
confond chemin de nœuds et chemin d'arêtes et renvoie `[]`. La consigne précise
le chemin singleton, avec rappel du sens de parent/enfant. Aucun champ d'identité
n'est forcé à la réponse attendue dans le schéma et un chemin vide vers soi-même
reste faux au score. Le rejeu contrôlé des 24 contextes passe de 22/24 à 24/24
réponses entièrement correctes. Ce diagnostic reste distinct de la campagne
réelle ; son résultat n'est pas une qualification de la stabilité sur 300 cycles.

Les 40 requêtes d'évaluation du comparatif complet restent exactement identiques
à celles reconstruites par la version finale. La correction d'ordre concerne
l'acquisition et la précision des chemins concerne l'identité ; les tâches de
transfert n'ont pas été réécrites après observation de leur résultat.

Le message utilisateur énonce chaque règle sans exécuter son calcul, sa casse,
son inversion ni sa concaténation de résultat. Les positions et le nombre de
caractères sont une représentation de l'entrée originale. Toute définition
absente est signalée explicitement. Le schéma laisse tous les résultats possibles
au modèle, y compris une réponse fausse ou un `null` injustifié. Le LLM écrit
`reasoning` puis sa réponse et sa confiance ; les champs de dérivation et de
proposition restent présents pendant l'apprentissage. Le motif `[0-9]{2}` remplace
`\d{2}`, ignoré par le convertisseur de schéma local : le domaine voulu reste
exactement celui des chaînes de deux chiffres.

La requête complète, dont le schéma et les paramètres de génération, est conservée
et reconstruite au rejeu. Le parseur reste `JSON.parse` ; il n'y a ni réparation,
ni second décodage, ni remplacement par un intermédiaire ou une explication.
Le raisonnement visible reste inclus dans les 2 048 tokens totaux de sortie et le
budget natif de 256 ne change pas. Les mêmes 300 transformations, 970 réponses,
poids Qwen2.5 14B, corpus, témoins, seuils, plafonds et règles d'arrêt sont maintenus.

Les essais rejetés sont conservés. La campagne confirmatoire utilise une nouvelle
graine après commit et gel des sources ; son résultat peut rester négatif. Cette
révision ne prétend pas corriger par le code une limite intrinsèque du modèle.

## Cycle de vie de l'oracle sous contention locale

La deuxième tentative V4 s'arrête après 45 cycles complets et 93 réponses brutes,
avant toute évaluation réservée. Le sous-processus d'oracle dépasse ses cinq
secondes avec `ETIMEDOUT`, même si son statut final vaut zéro. Le démarrage de
Node après chaque réponse multiplie cette exposition. Huit sondes séparées
réussissent ensuite entre 466 et 1 499 ms, serveur Qwen arrêté ; elles ne prouvent
pas que la contention GPU est la cause unique du timeout. Le dossier incomplet
reste conservé, sans reprise ni qualification. L'utilisateur demande de laisser
les autres modèles locaux actifs.

Chaque worker démarre désormais un processus d'oracle séparé avant ses appels
LLM. Le démarrage est borné à cinq secondes. Ce processus reçoit uniquement un
signal de disponibilité avant la première réponse ; aucune tâche ni aucun monde
ne lui est envoyé à ce stade. Chaque tâche lui est transmise seulement après
la journalisation de la réponse brute. Chaque aller-retour reste borné à cinq
secondes, y compris la transmission et la réception ; une réponse reçue après
l'échéance est rejetée même si le timer du parent a été retardé. Les identifiants
de requête et de tâche empêchent de mélanger les réponses. Une mort, un timeout,
une réponse inattendue ou une concurrence invalide définitivement le client,
sans redémarrage ni nouvelle tentative. Le processus est arrêté à la fermeture
du worker et quitte aussi si son parent disparaît.

Le fichier de calcul `oracle.cjs`, le corpus, les scores, les seuils, les 970
appels, les neuf workers comptés, les poids et les plafonds LLM restent identiques.
Le plafond global de quatre heures inclut le démarrage des oracles. Ce changement
de cycle de vie réduit le nombre de créations de processus ; il ne déplace pas
l'oracle avant la réponse, ne fournit aucun résultat au modèle et ne remplace
aucune réponse. La vérification hors ligne reste indépendante du transport.
Une nouvelle campagne complète commence dans un dossier distinct après commit
et gel. Aucun préfixe incomplet ni aucune graine évaluée n'est réutilisé.

## Alternatives conservées dans l'historique

- Calculer les résultats nativement ou injecter l'oracle dans la grammaire : ne mesurerait plus l'application demandée au LLM.
- Remplacer une réponse par un intermédiaire correct : masquerait une erreur brute.
- Accumuler les traces de travail : les variantes négatives montrent leurs limites avec ce modèle et ce budget.
- Augmenter le budget ou changer de modèle après les résultats : empêcherait cette comparaison à protocole constant.
