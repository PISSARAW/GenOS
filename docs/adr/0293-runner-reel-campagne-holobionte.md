---
title: Runner réel et reprise de campagne Holobionte
date: 2026-10-04
status: accepted
authors: GenOS
decision-id: 0293
---

# ADR 0293 — Runner réel et reprise de campagne Holobionte

## Contexte

L’ADR 0105 définit douze bras appariés et un runner séquentiel injectable. Celui-ci
ne fournissait ni commande opérateur, ni configuration d’adaptateur contrôlée, ni
journal exploitable après interruption. Une campagne de 600 à 1 200 exécutions ne
pouvait donc pas être reprise ou auditée par un chemin produit.

## Décision

- Ajouter une commande qui charge un adaptateur de campagne désigné explicitement
  et vérifié par empreinte SHA-256.
- Exiger un exécuteur distinct pour chacun des douze bras ainsi qu’un reçu runtime
  concordant avec le résultat, ses références de preuve et son vérificateur.
- Exiger un manifeste de missions fixe et un budget total en coût, tokens et durée.
- Journaliser chaque run et n’autoriser la reprise que si le manifeste, l’adaptateur,
  l’identifiant de campagne et le budget sont identiques.
- Produire le rapport final de manière atomique; aucune campagne ou décision de
  promotion n’est créée implicitement.

## Limites

Le dépôt ne contient pas les adaptateurs applicatifs qui réalisent chacun des douze
bras. Le runner contrôle la forme des reçus et leur cohérence avec les champs agrégés,
pas la vérité des références ni l’indépendance cryptographique des vérificateurs.
L’adaptateur, les preuves et la configuration d’exécution doivent accompagner les
résultats; jusqu’à leur présence et une exécution terminée, le statut demeure
« campagne non exécutée ».

## Vérification attendue

Une campagne complète doit inclure 600 à 1 200 runs, des reçus et preuves persistés,
le manifeste et les empreintes utilisés, ainsi qu’un journal complet. Cette décision
ne constitue pas une preuve qu’une telle campagne a été exécutée.
