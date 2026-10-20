# ADR 0688 — Intendance web guidée par des preuves longitudinales

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : SHEV, sites web, autorité, preuve d’effet
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0611, boucle SHEV

## Contexte

Un agent chargé durablement d’un site peut détecter une variation, modifier une
branche et réussir une preview sans pour autant avoir amélioré le site livré. Une
preview ne mesure ni l’usage réel après déploiement, ni l’exposition AppSec en
production. Un score isolé ne couvre pas non plus les dérives croisées de
visibilité, de contenu et de liens.

Le socle SHEV possède déjà une responsabilité persistante, des mandats versionnés,
des initiatives gouvernées et une surveillance post-effet. Il manquait un contrat
spécifique au site qui relie ces mécanismes sans accorder d’autorité à un simple
succès de transport ou de preview.

## Décision

L’intendance web utilise un panneau fermé de six familles de capteurs :
`analytics`, `seo`, `geo`, `links`, `content` et `appsec`. Chaque lecture porte son
environnement, sa source, son vérificateur, ses références de preuve et sa fenêtre
de validité. Un capteur absent, inconclusif ou périmé produit `NO_CHANGE` avec un
angle mort ; il ne permet pas une correction automatique.

L’arbitrage ordonne les signaux ainsi :

1. un risque AppSec observé produit une initiative `risk`, soumise à autorisation ;
2. une autre dégradation produit un diagnostic délégué si le mandat l’autorise ;
3. une opportunité produit une expérimentation soumise à autorisation ;
4. un panneau stable produit `NO_CHANGE`.

Une observation n’est persistée dans SHEV que pour l’environnement de production.
La branche, le sandbox et l’audit de preview constituent un candidat. Même après
une revue humaine ou politique vérifiée, ce candidat reste non autorisé au
déploiement dans ce service : une autorisation de déploiement séparée est exigée.
Le service ne fusionne, ne publie et ne déploie rien.

Après un déploiement autorisé, le gate d’effet exige au moins trois fenêtres de
production ordonnées, couvrant au minimum vingt-quatre heures. Les preuves
`analytics` (effet utilisateur) et `appsec` doivent être indépendantes des preuves
de preview. Le reçu longitudinal peut être `confirmed`, `regressed` ou
`inconclusive`; il déclare toujours `causalClaim: false` et
`previewUsedAsEffectEvidence: false`. Son verdict alimente le gate d’effet SHEV,
qui crée ensuite une surveillance continue.

## Conséquences

### Positives

- l’initiative endogène reste bornée par la fraîcheur et la provenance ;
- l’absence de dérive est représentée par un vrai `NO_CHANGE` ;
- la sécurité domine l’optimisation et conserve une autorité explicite ;
- la réussite de preview ne peut pas être présentée comme effet utilisateur ;
- un effet confirmé est suivi dans le temps par la surveillance SHEV.

### Négatives

- les six familles doivent être alimentées, sinon le système échoue fermé ;
- trois fenêtres retardent volontairement toute conclusion positive ;
- le reçu ne démontre pas la causalité et ne remplace pas une comparaison
  contrôlée via les protocoles longitudinaux SHEV.

## Alternatives

- **Promouvoir sur audit de preview** : rejeté, car aucune exposition utilisateur
  réelle ni sécurité de production n’est observée.
- **Déclencher dès qu’un capteur dérive** : rejeté, car les angles morts pourraient
  masquer une régression plus grave.
- **Déployer depuis ce service** : rejeté, car cela confondrait recommandation,
  revue, autorisation et effet.

## Implémentation et vérification

- `backend/src/services/shev/websiteStewardshipService.js`
- `backend/src/services/shev/websiteCandidateService.js`
- `backend/src/services/shev/adapters/websiteStewardshipAdapter.js`
- `node backend/tests/test_shev_website_stewardship.js`
- `node backend/tests/test_shev_website_candidate.js`
- `node backend/tests/test_shev_website_effect.js`

