# ADR 0080 — Intégration de Rhizome au Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, Rhizome, découverte, admission
- **Décideurs** : GenOS
- **Lié à** : ADR 0073, ADR 0076, ADR 0078

## Contexte

Rhizome découvre des fournisseurs de capacités tandis que Holobionte gouverne ses
partenaires résidents. Fusionner ces rôles ferait de la découverte une admission
implicite.

## Décision

L'adaptateur Holobionte reçoit un manque de capacité étayé par Rhizome, un nœud
candidat et sa preuve de vérification. Il réutilise le gate d'admission de capacité
Rhizome, traduit le kind du fournisseur vers le registre des symbiontes, puis crée
un candidat dans un Host persistant. Le candidat conserve sa provenance et ses
références de preuve. Le contrat, l'essai et l'admission Holobionte restent requis.

## Conséquences

### Positives

- La détection et l'intégration restent dans leurs domaines respectifs.
- Un candidat doit satisfaire le gap, la vérification et les providers de confiance.
- Rhizome ne reçoit aucune autorité sur l'admission du Host.

### Négatives

- Le pont dépend de formats compatibles de capacité et de preuve.
- Les providers et vérificateurs de confiance doivent être configurés par le Host.

## Alternatives

- Admettre directement tout résultat de découverte Rhizome : rejeté, car le Host doit
  conserver les gates d'admission et son autorité finale.
