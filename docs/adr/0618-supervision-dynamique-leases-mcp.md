# ADR 0618 — Superviser dynamiquement les leases MCP au point d'effet

- Statut : Accepté
- Date : 2026-10-18
- Domaine : runtime agentique, MCP, autorité, budgets et isolation
- Décideurs : équipe GenOS
- Lié à : ADR 0604, ADR 0613

## Contexte

L'enveloppe d'exécution v2 scelle déjà le run, le workspace, l'échéance et la
liste d'outils. Le serveur MCP Rust vérifie en plus une capacité d'acteur
persistée avant l'exécution. Le serveur Node ne consommait pas cette capacité :
un processus déjà lancé pouvait donc conserver sa liste statique jusqu'à son
expiration, même après une révocation dans le plan de contrôle.

Une découverte d'outil ou un transport réussi ne constitue ni une autorisation
dynamique ni une preuve de vérité. Le contrôle doit précéder l'effet et son
résultat technique doit rester séparé de la décision d'autorité.

## Décision

Chaque runtime supervisé reçoit une capacité opaque liée à l'autorité scellée,
au run, à la racine réelle du workspace, à l'échéance et à un nombre maximal
d'appels. Ce nombre est inférieur ou égal au budget d'événements de l'enveloppe
et ne peut pas être augmenté par le worker.

Les serveurs MCP Node et Rust utilisent le même pont avant et après chaque
appel :

1. `begin` relit l'autorité, le workspace, le lease, la révocation et le quota ;
2. la consommation du quota et la prédiction de l'effet sont atomiques ;
3. l'outil n'est exécuté qu'après une décision `allow` ;
4. `finish` relit la capacité et enregistre un résultat technique distinct ;
5. la fermeture du runtime révoque la capacité de façon durable.

Les décisions et observations sont enregistrées dans un journal immuable. Une
capacité historique sans budget v2 est refusée. Une erreur, un état inconnu ou
une migration incomplète ferme donc le chemin d'exécution.

## Conséquences

### Positives

- La révocation à chaud bloque l'appel suivant sans redémarrer le serveur MCP.
- Deux processus partageant SQLite ne peuvent pas consommer le dernier appel
  simultanément : la décision est sérialisée par transaction immédiate.
- Un autre workspace, un outil hors lease, une autorité devenue obsolète ou un
  quota épuisé sont refusés avant l'effet.
- `technical_success` atteste uniquement le retour du transport. Il ne rend pas
  la sortie vraie et ne satisfait pas, à lui seul, une porte de promotion.

### Négatives

- Chaque appel supervisé ajoute deux lectures/écritures courtes et le serveur
  Node utilise le pont local déjà employé par le serveur Rust.
- Une révocation survenant après le début d'un effet ne peut pas annuler cet
  effet ; elle empêche sa validation finale et tout appel ultérieur. Les outils
  irréversibles restent soumis à leurs protocoles de préparation et de
  compensation.

## Alternatives

- Relire uniquement les variables d'environnement : rejeté, car elles sont
  figées au lancement et ne portent aucune révocation durable.
- Ajouter un second registre propre au serveur Node : rejeté, car il créerait
  deux autorités divergentes.
- Compter les appels en mémoire : rejeté, car le quota ne survivrait ni aux
  processus concurrents ni au redémarrage.
