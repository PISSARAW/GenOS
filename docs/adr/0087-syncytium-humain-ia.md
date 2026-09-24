# ADR 0087 — Variant Humain-IA pour Syncytium

## Statut

Accepté — lot 24 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, présence humaine, leases et approbation d'actions critiques.

## Lié à

Phase 42 de la feuille de route Syncytium.

## Contexte

Le plan Human-AI Syncytium demande que l'humain, les workers LLM, les daemons de test et les vérificateurs sécurité soient des nuclei distincts, avec présence, leases, commentaires et portes d'approbation explicites.

## Décision

1. Déclarer chaque principal comme nucleus de domaine typé et réserver une autorité de domaine aux humains.
2. Partager la présence, les leases, commentaires, approbations et reçus d'action dans des champs typés du Shared State.
3. Acquérir et libérer les leases avec transactions sérialisables, expiration et jeton de fencing.
4. Autoriser uniquement les principaux humains à publier une décision d'approbation immuable.
5. Exiger une approbation positive correspondant à l'action; consommer son identifiant une seule fois dans une transaction sérialisable.

## Conséquences

### Positives

- La présence et les commentaires restent observables par les nuclei autorisés.
- Une ressource ne peut avoir deux leases actives concurrentes pour des titulaires différents.
- Les actions critiques ont une trace d'approbateur humain et ne peuvent réutiliser la même approbation.

### Négatives

- Les leases utilisent des expirations locales en millisecondes; un déploiement distribué doit fournir des horloges suffisamment cohérentes.
- Le contrat publie un reçu d'action et une gate Syncytium; l'exécution de l'effet métier demeure au service consommateur.

## Alternatives

- Traiter une réponse d'agent comme approbation : écarté, car elle n'établit pas une autorité humaine.
- Garder les leases hors du Shared State : écarté, car les nuclei n'auraient pas une vue coordonnée de l'ownership et de son fencing token.
