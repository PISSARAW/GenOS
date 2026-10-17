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

Les contrôles et le runner reproductibles sont :

```bash
node scripts/ci/check_external_deployment_contract.cjs
node backend/tests/test_external_deployment_contract.cjs
node scripts/ci/run_external_deployment_campaign.cjs --execute --image <image-immuable>
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

Le runner applique le manifeste, attend les trois pods, exécute le même graphe
Morphogenèse dans chacun, compare les digests, sonde `/readyz` et `/healthz`, supprime
un pod, attend un nouvel UID, rejoue le graphe et archive logs et reçu. Il refuse de
démarrer sans contexte Kubernetes explicite et refuse un pod dont l'image ne fournit
pas de digest immuable. L'application manuelle reste possible :

```bash
kubectl apply -f deploy/kubernetes/morphogenesis-parity.yaml
```

Le 17 octobre 2026, l'exécution locale du runner a retourné
`kubernetes_context_missing` : aucun cluster n'a donc été qualifié dans ce dépôt à
cette date. Le runner comble le manque d'exécution automatisable, pas l'absence
d'infrastructure. Un cluster Kubernetes ou fournisseur cloud ne devient qualifié
qu'après archivage d'un reçu externe valide.
