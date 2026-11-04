# Consignes et diagnostics des lignes de scène

- Statut : implémenté, contrôles synthétiques du chemin natif.
- Date : 2026-11-04.

## Contexte

Le format natif borné demande un tableau `lines` dont chaque élément contient
une seule ligne physique. Une relance réelle a produit des réponses JSON
complètes avec des éléments du type `ALAIN\nUne réplique.`. Le validateur local
a correctement refusé ces sauts de ligne internes.

La consigne de dialogue conservait cependant l'ancien exemple sous la forme
d'une chaîne contenant un saut de ligne. Cet exemple contredisait le nouveau
format de transport. La réparation transmettait le code, le digest et la fin de
réponse, mais omettait le diagnostic local précisant le défaut. La cible de
mots figurait seulement dans les données du budget, après le contexte natif.

## Décision

L'exemple de dialogue montre maintenant le contrat exact :
`{"lines":["PERSONNAGE","Une réplique."]}`. Les noms et répliques occupent
des éléments distincts et courts, sans saut de ligne interne. Une action ou
une réplique plus longue peut continuer dans l'élément suivant, à la fin d'un
mot ou d'une phrase, dans les limites déjà calculées.

La première consigne expose la cible **indicative** de mots déjà calculée par
le budget de scène. Ce rappel ne crée aucun minimum par scène et n'autorise
aucun remplissage. Le contexte natif, le brief et les handoffs restent transmis
intégralement.

Pour une réponse complète, mesurée et éligible à la réparation existante,
`sceneAttemptRepair.diagnostic` transmet le message exact du validateur. Cette
information reste une donnée JSON. La réparation n'inclut pas le texte rejeté.
Une réponse tronquée conserve uniquement les références de sa tentative et
son motif de fin ; aucun fragment n'est réintroduit ni fermé artificiellement.

## Conséquences et vérification

Les contrôles de sauts de ligne, d'en-têtes, de répétition et de bornes restent
inchangés, comme les budgets, le nombre maximal de réparations, les critères
scellés et les seuils de promotion. Le service ne transforme pas un élément
illégal en plusieurs lignes acceptées.

Le test natif vérifie que l'exemple est lui-même valide sous le schéma transmis,
que l'ancien exemple a disparu des instructions et que la cible du budget est
visible dans la consigne. Le test de génération reproduit un élément avec saut
de ligne, vérifie le refus, le diagnostic exact dans la réparation et les deux
appels mesurés. Il vérifie aussi qu'un préfixe tronqué n'est pas réintroduit.
Ces fixtures ne prouvent pas que le modèle suivra la nouvelle consigne ; une
nouvelle mission réelle doit passer les mêmes gates.

## Alternatives

- Découper automatiquement un élément illégal contournerait le validateur.
- Répéter seulement le code d'erreur conserverait l'ambiguïté du diagnostic.
- Ajouter un nouveau seuil de longueur modifierait la politique de qualité.
