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
L'échec Lean demeure un résultat observé et n'est pas effacé par une référence
écrite à la main.

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
