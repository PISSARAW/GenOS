---
title: Relationship-Aware Communication Routing and Token Accounting
date: 2026-09-26
status: accepted
authors: Bruney
decision-id: 0137
---

# ADR 0137 : routage relationnel et comptabilité des tokens

## Contexte

Le moteur de communication choisissait le dialecte, le niveau d'accusé de
réception et les destinataires sans lire le profil relationnel. Le driver de
cycle simulé transformait par ailleurs le coût abstrait en `cost × 500`, puis
enregistrait ce nombre comme des tokens dépensés et l'envoyait à l'apprentissage.

## Décision

- Après la sélection de l'audience, le moteur résout le profil relationnel de
  chaque destinataire. Il exclut les relations dont le niveau de divulgation ne
  couvre pas le risque et, lorsqu'une indépendance est demandée, celles sous le
  seuil demandé.
- Le dialecte est autorisé seulement si tous les destinataires partagent une
  relation qui le recommande avec confiance élevée. Le niveau d'accusé de
  réception est au moins aussi strict que le profil le plus exigeant.
- Le driver n'écrit jamais sa projection comme une consommation mesurée. Un
  reçu `genos.communication-usage/v1` du fournisseur, avec identifiant de
  réponse et tokens d'entrée/sortie entiers, alimente les compteurs mesurés et
  l'apprentissage. Sans reçu, la projection reste séparée et les tokens utilisés
  transmis à l'apprentissage valent zéro.

## Conséquences

- Les profils de relation modifient l'éligibilité et l'encodage de l'audience.
- Une estimation ne peut plus gonfler le total des tokens mesurés.
- Le driver local étant simulé, il ne produit pas lui-même de reçu fournisseur ;
  `modelProviderRequest` attache désormais un reçu aux réponses OpenAI, Anthropic
  et Gemini lorsque le fournisseur fournit un identifiant de réponse et les deux
  compteurs entiers. Pour le streaming SSE, le reçu exige aussi ces trois champs.
  Les estimations de repli ne deviennent jamais des reçus. Le bridge appelant
  doit encore transmettre explicitement le reçu au driver du même cycle ; aucun
  lien causal entre un appel modèle et une décision de communication n'est
  actuellement imposé par cette interface.

## Alternatives

- Continuer à utiliser `cost × 500` comme consommation : rejeté, car le coût de
  politique n'est pas un compteur de tokens fournisseur.
- Réutiliser le dialecte pour tous les destinataires d'un groupe : rejeté, car
  les profils adversariaux ou épistémiques peuvent exiger un encodage explicite
  et un accusé plus fort.
