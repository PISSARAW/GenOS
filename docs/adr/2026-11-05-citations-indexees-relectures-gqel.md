# Citations indexées dans les relectures GQEL

## Contexte

Les missions réelles du Dernier Sas échouent sur des citations recopiées de manière
inexacte ou découpées différemment des choix du schéma. Chaque nouvelle tentative
de relecture renvoie le livrable entier et consomme le budget mesuré. Ces échecs
de transport de la preuve empêchent de terminer l'évaluation sémantique.

## Décision

La grammaire de relecture accepte, en plus de la citation littérale existante,
un objet `{"quoteId": n}`. Cet entier désigne exactement le nième élément de la liste
`quoteCandidates` de cette requête, à partir de zéro. Le schéma borne l'index ; le
runtime refuse également les index absents et les objets combinant index et texte.
Il résout l'index dans le texte effectivement soumis à cette relecture, puis
exécute les contrôles habituels de citation, longueur et position dans la source.
L'évaluation et son reçu conservent la citation exacte et sa position, liées au
digest de l'artefact. La référence ne vaut pas verdict : le lecteur doit toujours
expliquer le lien entre la citation et chaque critère fixe.

La liste propose des phrases et des valeurs textuelles JSON, découpées seulement
si elles excèdent 160 caractères ; chaque élément reste présent dans la source.
Les échappements JSON restent représentés tels qu'ils figurent dans cette source.

## Conséquences

Les réponses existantes avec `quote` restent compatibles. La réponse indexée réduit
la copie littérale demandée au modèle. Les appels natifs de relecture de texte et
de scénario imposent le transport indexé : la liste des choix apparaît une seule fois dans le prompt,
avec ses clés numériques explicites, et le schéma borne les index sans retransmettre
le même texte en enum. Le profil de code conserve son prompt et sa grammaire de
citation littérale ; l'API de validation des anciennes réponses reste compatible.
La validation ne retrouve jamais une citation
approximative, ne répare pas un index invalide et ne modifie pas les critères,
les budgets, les exigences de lecteurs ou les gardes de promotion. Les anciens
checkpoints conservent leurs preuves et leurs refus ; ils ne sont pas réinterprétés
comme des réussites. Les index sont locaux à une requête et ne servent pas
d'identifiants durables entre versions du texte.

Le respect du brief d'un scénario est évalué sur son livrable entier, avec la
logline, les fiches et la note demandées. Les critères du corps joué restent liés
à cet extrait ; le paratexte ne peut donc pas justifier la qualité des scènes.
Les titres de notes reconnus en texte brut ou en gras arrêtent aussi le décompte
du corps : une longue intention ne peut pas satisfaire le minimum de mots joués.

## Alternatives

- Retirer l'enum et accepter une citation approximative : rejeté.
- Augmenter indéfiniment les appels ou le budget : rejeté.
- Réduire le nombre de critères ou de lecteurs : rejeté.
- Sélection bornée par index avec résolution exacte : retenue et testée avec des
  index valides, hors liste et ambigus, en plus des refus de citations inventées.
