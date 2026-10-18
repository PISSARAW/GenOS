# Admission des qualifications fondatrices — phase 9

- **Date** : 2026-10-18
- **Ancre de qualification** : `fbe10246fbf87fe95e60c2ef954aa36a4dfbb861`
- **Résultat** : 19/19 principes à la note 4, admission courante et bornée
- **Reçu v3** : [principes-fondateurs-phase9.json](receipts/principes-fondateurs-phase9.json)

## Capacité ajoutée

La phase 9 transforme l'évaluation révocable en frontière de consommation. Un
consommateur déclaré obtient un bail local seulement si le reçu, les sources,
les observations, la fraîcheur et la chaîne de révocations sont tous valides.
Le bail est signé Ed25519, lié au consommateur et à son usage, plafonné à cinq
minutes et ne peut jamais dépasser la validité des preuves.

Les révocations ne reposent plus sur un nom d'autorité en clair. Une entrée v2
est séquencée, chaînée au hash précédent, signée Ed25519 et vérifiée contre un
registre de clés publiques actives. Toute signature inconnue ou falsifiée met
la qualification en quarantaine, même si elle ne vise pas le reçu courant.

## Refus exécutés

- consommateur absent de l'allowlist ;
- TTL nul, négatif ou supérieur au plafond ;
- bail expiré ou présenté par un autre consommateur ;
- contenu du bail altéré ;
- qualification périmée, en quarantaine ou révoquée ;
- entrée de révocation signée par une clé inconnue ou forgée ;
- rupture de séquence, de hash précédent ou de hash d'entrée.

La campagne canonique a exécuté onze tests et produit le reçu
`e1b8fc18dfb4c24b8c625fc1ca2d11608f1d15c35798fc6111aaedf2ece21da5`.
La sortie technique reste distincte d'une autorité de promotion : le reçu de
qualification et le bail portent tous deux `authorizesPromotion: false`.

## Limites

- Le registre de confiance canonique est vide jusqu'à l'enregistrement gouverné
  d'une clé publique de déploiement ; les clés privées ne résident jamais ici.
- Le bail est vérifié contre le registre de clés publiques ; le déploiement doit
  fournir et protéger la clé privée de l'émetteur.
- Le stockage append-only est représenté par le fichier versionné et sa chaîne ;
  ce lot ne fournit pas de réplication ni de journal matériel inviolable.
- La note 4 reste limitée au parcours déclaré dans le manifeste.
