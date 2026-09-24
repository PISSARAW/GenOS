# ADR 0066 — Co-adaptation Holobionte

## Statut

Accepté — dix-septième lot du plan Holobionte.

## Contexte

Le Host et ses symbiontes peuvent améliorer leur compatibilité à partir des
résultats observés : contexte d’appel utile, preuves produites, conventions,
erreurs récurrentes et forme attendue des sorties.

## Décision

1. Enregistrer les observations de compatibilité dans la mémoire
   `PARTNER_REPUTATION`, avec capacité contractuelle et preuves vérifiées.
2. Exposer les apprentissages séparément pour l’appel du symbionte et ses
   adaptations au vocabulaire, aux conventions et aux erreurs du Host.
3. N’autoriser l’adaptation d’un contrat actif que pour réduire ses
   capacités, ses baux d’outils, son accès aux données, ses budgets ou sa
   dépendance.
4. Faire vérifier l’adaptation par la constitution du Host et AEIS avant
   d’ajouter une révision append-only du contrat.

## Conséquences

- L’apprentissage améliore le choix du contexte et la réputation du
  partenaire, sans modifier son autorité.
- Une demande d’expansion contractuelle est rejetée ; une extension de
  capacité demande un nouveau processus d’admission et de contrat.
- Les observations non prouvées ne sont pas assimilées dans la mémoire.

## Alternatives

- Réécrire le contrat actif en place : rejeté, car cela effacerait l’historique
  de décision et de permission.
- Autoriser les extensions automatiques lors d’une bonne performance :
  rejeté, car la performance observée ne constitue pas une autorité nouvelle.
