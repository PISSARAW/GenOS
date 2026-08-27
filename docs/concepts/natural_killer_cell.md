# Natural Killer Cell (Cellule NK)

La cellule NK est le premier rempart contre les tests infalsifiables.

## Principe : Le "Soi Manquant"
En biologie, les virus tentent parfois d'échapper au système immunitaire en effaçant les vitrines de présentation (CMH-I) de la cellule. Le testeur classique ne voit pas d'anomalie. La Cellule NK a pour rôle de vérifier que le test lui-même est présent et non-vide (Missing Self).

Dans GenOS, les agents IA créent parfois des tests qui retournent au vert parce que la liste des conditions à tester est vide (le fameux `all([]) == True`). La fonction `naturalKillerScan` inspecte l'AST ou le code source du test. S'il repère qu'une collection vide est utilisée comme passe-droit, il déclenche l'apoptose de l'agent.
