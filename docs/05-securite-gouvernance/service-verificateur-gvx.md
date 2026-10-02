# Service de vérification GVX

Le runtime peut déléguer la vérification des artefacts et l'émission des reçus de
développement à un processus Node séparé :

```powershell
node backend/bin/genos-gvx-verifier.cjs
```

Le service écoute par défaut sur `127.0.0.1:4011`. Il exige
`GENOS_GVX_VERIFIER_TOKEN` (au moins 32 caractères) et une clé privée Ed25519 dans
`GENOS_GVX_VERIFIER_PRIVATE_KEY_FILE`. La clé privée ne doit être présente que dans
l'environnement et le système de fichiers du compte qui exécute ce service. Pour une
frontière entre machines, publier le service derrière TLS avec authentification mutuelle.

Le runtime reçoit seulement la clé publique dans `GENOS_GVX_VERIFIER_PUBLIC_KEY`,
l'URL dans `GENOS_GVX_VERIFIER_URL` et le jeton d'accès dans
`GENOS_GVX_VERIFIER_TOKEN`. Il construit le registre avec
`gvxVerifierRegistry.fromRemoteControlPlane(ids, options)` et transmet ce registre à la
nursery. Le client vérifie les signatures Ed25519 et les liaisons entre artefact,
requirement, vérificateur et reçu. `creditVerifiedReceipt` n'accepte que le schéma de
reçu GVX v2 signé par cette clé. L'ancien HMAC du service épistémique générique n'est
pas une preuve suffisante pour accorder de la plasticité GVX.

Le registre doit inclure les deux vérificateurs intégrés lorsqu'un cycle inclut
l'évaluation somatique :

```js
const registry = require('./gvxVerifierRegistry').fromRemoteControlPlane([
  'artifact-integrity-v1', 'gvx-somatic-assessment-v1'
], {
  url: process.env.GENOS_GVX_VERIFIER_URL,
  publicKey: process.env.GENOS_GVX_VERIFIER_PUBLIC_KEY,
  token: process.env.GENOS_GVX_VERIFIER_TOKEN
});
```

## Dispatch du cycle depuis AGOW

Un signal persistant qui recommande `create_hypothesis` ou `schedule_experiment` lance
`runCycle` quand le backend configure aussi :

- `GENOS_GVX_LIFECYCLE_ADAPTER_MODULE` : module Node statique de l'application ;
- `GENOS_GVX_LIFECYCLE_ADAPTER_SHA256` : SHA-256 exact des octets du module.

Le module expose `createAdapters({ db, signal })` et renvoie les fonctions
`hypothesisPlanner`, `experimentInput`, `assessmentInput`, `developmentalReceiptInput`,
`applicationInput`, `monitorInput` et `selfTwinPredictor`. Il s'exécute dans le processus
backend de contrôle, pas dans le runtime du worker. `experimentInput` fournit l'isolation,
le runner et le registre distant. L'assessment et chaque requirement de métrique doivent
être couverts par des reçus signés. Si le module manque, si le hash ne correspond pas ou
si un adapter échoue, le statut reste `deferred` et aucun crédit positif n'est accordé.
Une retransmission d'un signal déjà enregistré ne rejoue pas le cycle automatiquement.

Ces adapters restent à implémenter pour chaque application : les métriques métier, le
retour arrière et la surveillance longitudinale ne peuvent pas être déduits d'un signal
AGOW générique. Voir [ADR 0272](../adr/0272-execution-cycle-developpemental-gvx.md).

Le vérificateur intégré `artifact-integrity-v1` confirme uniquement que le SHA-256 des
octets correspond à la déclaration. Pour ajouter des vérifications métier, le processus
peut charger un module de vérificateurs statique avec `GENOS_GVX_VERIFIER_MODULE` et
`GENOS_GVX_VERIFIER_MODULE_SHA256`. Le module expose `register({
registerVerifierImplementation, registerVerifier })`. Le runtime ne charge pas ce module
d'exécution : il doit épingler dans sa configuration de confiance les mêmes identifiants,
types et digests déclarés par le service. Les requirements métier non configurés
échouent fermés.

Le service inclut aussi `gvx-somatic-assessment-v1`, requirement
`gvx-somatic-assessment`. Il recalcule l'assessment avec les règles GVX, exige des reçus
de vérification signés pour chaque paire artefact/vérificateur et refuse les profils
différents de `gvx-somatic-conservative-v1` (au moins trois échantillons, zéro régression
admise, maintien de `safety` et amélioration mesurable d'au moins une métrique). Cela
vérifie la décision sur les mesures fournies; cela ne valide pas, à lui seul, la collecte
ou la pertinence métier de ces mesures. Chaque métrique du profil exige aussi un reçu
`gvx-somatic-metric:<nom>`. Ces vérificateurs doivent venir d'un module métier épinglé
au control plane. Leur reçu doit lier le nom de métrique, le bras (`baseline` ou
`candidate`), la moyenne recalculée et le nombre d'échantillons aux octets vérifiés. Sans
eux, l'assessment est rejeté et aucun crédit positif n'est signé.

Le processus séparé protège la clé contre le chargement accidentel dans le runtime. Une
isolation contre un runtime compromis exige aussi un compte système distinct, des droits
de fichiers réduits et, pour une frontière forte, un hôte ou conteneur séparé. Le service
ne certifie pas les sémantiques d'un domaine sans vérificateur métier correspondant.

## Capteurs GVX alimentés

`interoceptionBridge.sampleCanonicalInteroception` calcule désormais :

- `securityAnomalies` : taux d'événements de sécurité ciblés parmi les événements de
  télémétrie de l'agent sur trente minutes ;
- `coordinationLoad` : part des événements de dispatch et coordination dans cette même
  fenêtre ;
- `calibrationError` : erreur absolue moyenne des observations SelfTwin sur trente
  minutes.

Ce sont des mesures opérationnelles bornées, pas des mesures de capacité système ou une
calibration probabiliste. Une table absente, une fenêtre vide ou l'absence d'observations
SelfTwin produit `unknown`; aucune valeur n'est imputée à zéro.

Voir [ADR 0270](../adr/0270-control-plane-de-verification-gvx.md).
