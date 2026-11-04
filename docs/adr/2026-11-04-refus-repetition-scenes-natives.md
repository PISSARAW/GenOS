# Refus des boucles et copies de corps dans les scènes natives

- **Statut** : Implémenté — diagnostic structurel et tests ; raccord au workflow dans le point de génération bornée.
- **Dernière revue** : 2026-11-04.

## Contexte

La tentative 11 du Dernier Sas atteint 16 000 tokens de sortie dans la première
scène. La réponse tronquée contient 262 occurrences d'une même phrase. Des
tentatives antérieures réutilisent aussi le même corps dans plusieurs scènes.
Un en-tête correct et une métrologie complète ne prouvent pas la progression
de la scène. Les simples répétitions de noms ou refrains courts sont cependant
des constructions légitimes qu'un diagnostic mécanique ne doit pas interdire.

## Décision

`qualitySceneRepetition` inspecte le texte sans le modifier. Pour les boucles
internes, il regroupe les passages normalisés d'au moins huit mots et quarante
caractères apparaissant au moins quatre fois. Le refus exige simultanément
120 mots répétés au-delà de la première occurrence, une domination d'au moins
45 % des mots hors en-têtes et noms de personnages, et un pic de six occurrences.
Les positions et citations fournies restent celles du texte examiné.

Un autre diagnostic compare le corps normalisé aux scènes précédentes :
en-têtes exclus, noms conservés, espaces, casse et ponctuation normalisés.
Il exige au moins quatre-vingts mots hors en-têtes et noms. Cette comparaison
couvre aussi un corps composé de nombreuses répliques courtes. L'empreinte du
texte précédent et celle du corps normalisé accompagnent le diagnostic.

`assertSceneNovelty` retourne exactement son entrée ou refuse avec
`GQEL_SCENE_REPETITIVE`, des défauts de scène et leurs preuves. Le marqueur
`repairable` permet au workflow de demander une nouvelle écriture dans son
budget existant ; il n'autorise ni suppression automatique, ni compression,
ni promotion du texte refusé.

## Conséquences et vérification

`test_gqel_scene_repetition.cjs` couvre les boucles de dialogue et d'action,
copies de corps avec en-têtes différents, copies de répliques courtes,
variations de casse et de Markdown, noms récurrents, refrains, changements
de personnages et de dénouement, preuves littérales et contexte invalide.

Le test peut examiner la réponse brute tronquée par un chemin explicite
`GENOS_REPETITION_RAW_TURNS`. Ce probe négatif rend seulement les séparateurs
de ligne visibles pour l'analyse. Il ne répare pas le JSON, ne rend pas la
réponse valide et ne crée aucun candidat livré. Les artefacts bruts restent
hors Git. Ce diagnostic ne détecte pas toutes les paraphrases ni toutes les
boucles de répliques très courtes. Il ne certifie aucune qualité artistique :
les critères sémantiques et gates natifs restent nécessaires.
Les noms participant à l'identité du corps, une copie qui les renomme peut
également passer ce contrôle conservateur ; la continuité reste à évaluer.

## Alternatives

- Supprimer les doublons : rejeté, car cela modifierait le texte du modèle.
- Interdire toute phrase répétée : rejeté, car noms, rappels et refrains sont légitimes.
- Se fier uniquement au volume ou à l'en-tête : insuffisant face aux boucles observées.
