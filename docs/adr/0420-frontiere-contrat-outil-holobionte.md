# ADR 0420 — Contrat persistant avant invocation d'un outil Holobionte

## Statut

Accepté.

## Contexte

La sélection du variant `tool` persistait une politique `contract-bound`.
L'opération `executeToolInvocation` validait ensuite un manifeste et un bail
fournis dans `runtimeInput`, mais le contrôleur n'interrogeait pas le contrat
actif ni la résidence du symbionte avant d'appeler l'exécuteur. La vérification
de preuve de l'évaluation survenait après cet appel. Le chemin persistant
pouvait donc lancer un effet externe avant d'établir l'autorité contractuelle.

## Décision

- Le contrôleur vérifie la politique sélectionnée et le résident, puis charge
  la dernière révision du contrat depuis SQLite. Le nom d'outil et toutes les
  permissions du manifeste doivent appartenir au contrat actif.
- Le bail transmis au validateur d'outil est dérivé par le runtime du contrat,
  et le contrat est relu juste avant l'appel effectif de l'exécuteur.
- Un refus est conservé dans le journal append-only comme évaluation
  `REFUSED`, avec la raison, la révision de session et la référence du contrat.
  L'exécuteur n'est pas appelé. Une exception pendant l'exécution est notée
  `UNKNOWN_EFFECT` : le runtime ne prétend pas que l'effet externe a été annulé.
- Un résultat sans sortie acceptée reste `UNVERIFIED`. Une sortie exécutée dont
  la preuve indépendante est rejetée reste aussi `UNVERIFIED`, avec sa raison
  journalisée. Seule une sortie acceptée et vérifiée reçoit un reçu de succès.

## Limites

Cette frontière s'applique au chemin de variant persistant. Le validateur pur
reste disponible séparément. La politique `contract-bound` n'est pas une preuve
d'isolation système, et l'intégrateur reste responsable de la sandbox et de
l'état de santé effectif de l'outil. Une révocation qui intervient pendant
l'exécution ne peut pas annuler l'effet déjà produit; elle exige la gestion
d'incident du fournisseur. Les autres politiques de mémoire, régénération et
réseau restent des plans ou des chemins spécialisés tant que leurs opérations
externes ne sont pas reliées à leurs propres frontières de preuve.
