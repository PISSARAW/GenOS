# Enforcement métabolique par la cellule de garde

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime, métabolisme, flux, cellules spécialisées
- **Décideurs** : GenOS
- **Lié à** : ADR 0193

## Contexte

Le throttling stomatique calculait une admission sans la relier au registre ATP partagé.

## Décision

`GenosEcosystem::throttle_flux` adapte l'ouverture aux ressources métaboliques,
calcule le flux, puis débite le coût du flux admis dans `Metabolism`. Si la demande est
invalide ou le débit impossible, l'appel ferme le flux, conserve le refus dans le
registre commun et émet un reçu runtime.

## Conséquences

### Positives

- L'admission dépend du budget réellement disponible et produit un reçu corrélé.

### Négatives

- Le facteur de conversion flux/ATP est une politique locale (1 % du flux admis) et
  demande calibration avant une interprétation physique.
- Le registre des reçus est en mémoire.

## Alternatives

- Débiter un registre distinct de la cellule de garde : rejeté, car cela contournerait
  le budget partagé du runtime.
