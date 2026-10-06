# ADR 0324 — Biologie des exécutions et autorité durable

## Décision

Une mission relie deux registres explicitement distincts. Le runtime Rust conserve
ses cellules, génomes, populations, divisions et dépenses ATP. Chaque exécution de
worker Node possède une cellule stable dans la mission et un génome figé à partir
de son contrat de stratégie. Son reçu lie mission, worker, run, cellule, génome,
mesures disponibles, résultat et preuves. Aucun taux de conversion ne relie ATP,
tokens et USD. Une télémétrie absente reste inconnue.

Le contrat d'homéostasie est une autorité SQLite versionnée : une tête désigne sa
révision active, les révisions sont immuables et leur contenu est vérifié au
chargement. Une évaluation sans nouvelle déclaration recharge cette autorité.
Une modification explicite exige la révision attendue. Les vérificateurs doivent
être déclaratifs et rejouables. Une fermeture JavaScript ne constitue pas une
autorité durable. Les seuils et leur version font partie du contrat.

Les événements des workers sont conservés avant leur traitement. Une reprise
réconcilie les runs terminés avec leurs observations pour créer les reçus manquants.
Le reçu de transition conserve l'état antérieur, l'état évalué, le contrat et les
empreintes des reçus d'exécution utilisés. Un résultat déclaré ou un transport
réussi ne constitue pas une preuve : les gates existantes demeurent obligatoires.

## Alternatives

Assimiler un worker Node à la cellule racine Rust est rejeté : les identités,
instructions et registres de coûts ne correspondent pas. Reconstruire l'autorité
depuis le prompt après redémarrage est rejeté : cela peut affaiblir les exigences.

## Conséquences

Les reçus sont idempotents et vérifiés par empreinte. Les écritures liées sont
transactionnelles. Les historiques restent lisibles ; la politique v1 est
rejouée selon ses règles, la politique v2 applique explicitement les seuils par
classe avec une couverture de sécurité intégrale. Les tests de reprise utilisent
une vraie base SQLite. Cette décision porte sur le contrat logiciel d'exécution,
pas sur une reproduction de la physiologie biologique.
