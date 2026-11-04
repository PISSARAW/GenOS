# ADR 0793 — Fermeture des flux du bootstrap de capsule

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Domaine** : processus Node, capsules et récupération

## Contexte

La validation Node sous Windows a rencontré une erreur Socket `ENOTCONN`
pendant le bootstrap natif. Les erreurs du processus enfant ne couvrent pas
celles de ses flux stdout et stderr. Une erreur non écoutée arrêtait Node.
L'appelant supprime le répertoire de bootstrap lorsqu'une tentative échoue.

## Décision

Écouter les erreurs des deux flux avant de commencer à lire leurs données.
Conserver la première erreur, demander une seule fois la terminaison de
l'enfant et refuser le résultat même si son code de sortie est ensuite zéro.
Aucun appel ni effet n'est réémis automatiquement.

Le bootstrap attend la fermeture native du processus et de ses flux. Le délai
initial n'est pas prolongé pour autoriser du travail. L'arrêt utilise sa période
de grâce existante, puis une attente de drainage bornée. Si la fermeture reste
inconfirmée, le rejet porte `cleanupPending=true` et sa cause initiale.

L'appelant conserve alors le répertoire et refuse tout fallback, même demandé.
Pour une capsule corrélée, le refus existant de réutiliser un répertoire non
scellé impose une récupération explicite. Une erreur de flux avec fermeture
observée n'autorise un fallback synthétique que s'il a été explicitement demandé.
Les autres règles de fallback, d'environnement, de confinement et de sceau sont
conservées. Aucun flux n'est détruit pour fabriquer une preuve de fermeture.

## Validation

Les régressions injectent séparément une erreur de stdout et de stderr,
contrôlent l'absence de succès après erreur et la terminaison unique, puis
vérifient le rejet borné et la conservation du répertoire si la fermeture n'est
pas observée. Le parcours natif existant reste un contrôle positif distinct.
