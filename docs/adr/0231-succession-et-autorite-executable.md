# ADR 0231 — Succession et autorité executable

## Contexte

La reprise lançait le runtime avant le CAS de succession. Un perdant pouvait
donc avoir produit un effet avant son refus.

## Décision

Réserver l'identité et une génération/token durable dans la transaction de
succession, puis arrêter le runtime précédent et lancer le gagnant. Les gates
de dispatch et MCP consultent l'autorité actuelle, y compris les ancêtres.
Une réservation survit au crash ; sa reprise exige l'identité courante.
Le CAS reserved→launching empêche deux lancements du même successeur. Un crash
en launching reste bloqué : arrêter et vérifier le runtime avant toute nouvelle
autorisation ; aucune reprise automatique ne prétend assurer exactly-once.
Un lancement échoué est marqué failed et ne prétend pas rendre l'ancien actif.

## Conséquences

Deux processus sur SQLite WAL local partagent l'arbitrage. Ce contrat ne
supporte pas une base SQLite sur système de fichiers réseau. Les effets
directs d'un exécutable externe hors gates GenOS ne sont pas clôturés par SQL.
L'arrêt de processus est complémentaire aux contrôles d'autorité.

## Alternatives

Lancer puis arbitrer est trop tard. Un verrou uniquement en mémoire ne
protège pas les processus concurrents ni le redémarrage.
