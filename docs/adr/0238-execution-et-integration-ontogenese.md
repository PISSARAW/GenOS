# ADR 0238 — Exécution persistante et intégration vérifiée d’Ontogenèse

Date : 2026-10-01. Statut : accepté. Complète l’ADR 0235.

## Problème

La boucle résidente sélectionnait des tâches sans lancer le runtime. Les preuves
non vides ne prouvaient aucune exécution de tests. L’arrêt, la reprise des claims
expirés et le script de démarrage automatique ne terminaient pas leur parcours.

## Décision

Le CLI injecte `runtimeHarness` dans `tickOnce`. Avant le lancement, une transaction
enregistre l’opération, sa réservation et la tâche en cours. Un index unique limite
chaque projet à une opération active. Le processus de mission revendique atomiquement
l’opération préparée, puis utilise le runtime et les gates existants. Un redémarrage
observe l’opération persistée sans relancer un worker déjà enregistré.

Les changements restent dans des capsules ; l’intégrateur possède un worktree sur
la branche dédiée. Les vérifications structurées configurées sont exécutées dans
la capsule, puis dans le worktree d’intégration. Une empreinte SHA-256 associe les
preuves au contenu. Les chemins sont normalisés et confinés sans traversée de liens
symboliques ; les fichiers interdits et les modifications humaines bloquent le commit.
Le message contient l’identifiant d’opération pour réconcilier commit et SQLite.

Les budgets réservés sont déduits avant admission. À la terminaison, la réservation
entière est débitée une seule fois : comptabilité conservatrice, sans prétendre mesurer
le coût réel du fournisseur. Les pauses, arrêts et pressions critiques suspendent
l’exécution détenue ; le réveil demande un seuil de récupération stable.

## Portée et limites

La sélection transmet la topologie et la variante au runtime/morphogenèse existants.
Elle ne constitue pas une preuve que les huit topologies ou toutes leurs variantes
ont été exécutées. Le fournisseur et ses capacités doivent être configurés.
Les tests de parcours injectent un worker, mais exécutent réellement les vérifications
et Git ; ils ne valident pas une mission avec fournisseur externe.

La mesure des processus, les réservations et la suspension bornent l’admission, mais
ne garantissent pas une limite physique instantanée de RAM. Aucun Job Object Windows
n’est installé. Les capsules sont conservées pour les preuves ; leur purge relève de
l’exploitation. Un backlog vide mène à `IDLE` ; la décomposition automatique d’un projet
complet et une interface semblable à Dots restent des fonctionnalités distinctes.

## Vérification

`npm --prefix backend run test:ontogenesis` couvre les contrats, les claims expirés,
le contrôle opérateur, les budgets, l’hystérésis mémoire, les chemins, les preuves,
les échecs de vérification et la réconciliation d’un commit après crash.
