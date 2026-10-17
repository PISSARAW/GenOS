# Preuve de déploiements morphogenétiques externes

## Portée actuelle

Le harness `backend/tests/test_morphogenesis_network_deployment_parity.js` démarre trois
processus Node indépendants, expose un endpoint HTTP par processus et partage une
base SQLite en mode WAL. Il vérifie le contrat `genos-morphogenesis-parity-v1`, la
convergence du digest de morphologie, puis un scénario de panne : un processus est
arrêté, un survivant relit la preuve persistée et le processus est redémarré.

```bash
node backend/tests/test_morphogenesis_network_deployment_parity.js
```

La preuve couvre donc la frontière processus + réseau HTTP, la persistance partagée
et la reprise locale. Le résultat est explicitement `externalScheduler: false`.

## Ce qui reste à déployer

Cette campagne ne qualifie pas Kubernetes, un scheduler cloud, un volume réseau,
une réplication multi-région, TLS public ou une politique de bascule externe. Une
preuve de déploiement réel doit fournir le même contrat, un healthcheck, le digest
normalisé de sortie et un historique de reprise vérifiable. Tant qu'un endpoint
réel n'a pas fourni ces éléments, GenOS ne revendique aucune parité externe.
