# 0132 — Runtime comportemental des variants Biome

- **Statut** : accepté
- **Date** : 2026-09-26
- **Domaine** : Biome, ressources, recherche, persistance, preuves
- **Décideurs** : GenOS
- **Lié à** : [ADR 0124](0124-selection-automatique-des-variants.md), [ADR 0100](0100-controle-ecologique-biocenose.md)

## Contexte

Le sélecteur Biome savait reconnaître onze profils et joindre une consigne à la composition,
mais plusieurs politiques n'agissaient pas sur l'écologie persistée. Les ressources avaient
déjà un vecteur multi-dimensionnel, le foraging, les niches et les sessions SQLite; les
contrôleurs Quality-Diversity, succession, résilience, connaissance, calcul, adversarialité
et échelle multi-niveau manquaient.

## Décision

- Exposer un cycle `advance_variant` sur une session Biome, journalisé comme événement
  écologique et accessible par `genos_topology_session`.
- Garder un contrôleur par famille de mécanismes. Les contrôleurs réutilisent l'allocation,
  le foraging, la découverte de niches, les réserves et le biofilm existants.
- Exiger des références de preuve pour élites QD, ouverture de niches, transitions
  adversariales et recolonisation. La génération ouverte est bornée à 20 candidats par cycle,
  évalue un critère minimum utilité/coût et suspend la pression après cinq cycles stériles.
- Borner l'adversarial aux scénarios abstraits et aux références d'artefacts; aucun payload
  ni exécution d'attaque n'est accepté par ce contrôleur.
- Persister l'environnement longitudinal sur une clé stable explicite. À défaut, la session
  reste persistée sous son identifiant propre et ne se fusionne pas avec d'autres missions.
- Garder les variants au statut partiel jusqu'à des missions discriminantes et des mesures
  de qualité, coût, preuve et récupération.

## Conséquences

### Positives

- Chaque variant produit un effet écologique concret ou une décision bornée, un reçu, et un
  état consultable dans la session.
- Les dimensions de coût, quota, CPU, GPU, RAM et énergie sont représentées dans le vecteur
  de ressources. Le scheduler calcule le placement faisable en tenant compte de la localité,
  du coût et de la latence.
- Les environnements persistants peuvent transporter ressources, populations, niches,
  mémoire écologique et biofilm entre missions qui partagent la même clé.

### Négatives

- Le cycle reste déclenché par une opération externe; un daemon autonome de saison n'est pas
  inclus.
- Le scheduler compute recommande un fournisseur et n'exécute pas le déplacement d'un
  worker ni l'appel fournisseur.
- Les évaluations d'environnements ouverts et les résultats adversariaux exigent des preuves
  fournies par un vérificateur externe; le contrôleur ne prétend pas les produire.
- Les scores et seuils restent heuristiques tant qu'ils ne sont pas calibrés par benchmark.

## Alternatives

- Traiter le nom du variant comme une simple consigne de prompt : rejeté, car cela ne modifie
  ni les allocations ni l'état du Biome.
- Exécuter automatiquement des attaques, des migrations fournisseurs ou des environnements
  générés : rejeté, car le runtime ne dispose pas des autorisations, vérificateurs et preuves
  de sécurité nécessaires.
- Déclarer les onze variants complets sans validation par mission : rejeté, car une opération
  câblée ne démontre pas encore la qualité de l'écosystème en conditions d'exécution.
