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

## Préparation Kubernetes et cloud

Le manifeste [`deploy/kubernetes/morphogenesis-parity.yaml`](../../deploy/kubernetes/morphogenesis-parity.yaml)
fournit une StatefulSet de trois pods, un service headless, des volumes dédiés et
les sondes `/readyz` et `/healthz`. Il fixe le contrat
`genos-morphogenesis-parity-v1`, mais ne constitue pas une observation cloud :
l'image doit être construite et le contexte Kubernetes choisi par l'opérateur.

Le contrôle reproductible est :

```bash
node scripts/ci/check_external_deployment_contract.cjs
node backend/tests/test_external_deployment_contract.cjs
```

Sans outil ou reçu d'exécution, le contrôle retourne `status: not_observed` et
`claimable: false`. Il inventorie `kubectl`, Docker, kind et minikube pour rendre
le manque d'environnement explicite. Après une exécution réelle, l'opérateur peut
fournir un fichier via `GENOS_EXTERNAL_DEPLOYMENT_RECEIPT` contenant `target`,
`runId`, le contrat, le contexte et le namespace, avec
`schemaVersion: genos-morphogenesis-external-receipt-v1`. Le reçu doit aussi
inclure au moins trois identités de pods prêtes, les deux sondes HTTP avec leur
heure d'observation, le digest SHA-256 de l'image et de la sortie, une preuve de
redémarrage avec les UID avant/après et des `evidenceRefs` vers les journaux
archivés. Un simple booléen ou un digest isolé est rejeté. Le même contrôle passe
alors à `status: observed`; le reçu doit rester archivé avec les logs du cluster,
le contexte utilisé et la version exacte de l'image.

L'application reste volontairement explicite :

```bash
kubectl apply -f deploy/kubernetes/morphogenesis-parity.yaml
```

Cette préparation ne qualifie donc aucun cluster Kubernetes ou fournisseur cloud
tant qu'un reçu externe valide n'est pas présent.
