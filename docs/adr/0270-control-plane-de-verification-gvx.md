# ADR 0270 — Control plane de vérification GVX isolé

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : GVX, vérification indépendante, clés de signature
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0019, ADR 0030, ADR 0266

## Contexte

Le registre GVX et le signataire HMAC résidaient dans le processus backend. Leur code
pouvait donc être importé par les composants du runtime. Le vérificateur d'intégrité
intégré relisait les artefacts et recalculait leur hash, sans vérifier leur sens métier.

## Décision

Un processus autonome expose deux opérations : vérifier un artefact avec une
implémentation enregistrée et signer un reçu de développement dont chaque référence
est liée à un reçu de vérification Ed25519 valide. La clé privée reste dans le service;
le runtime épingle la clé publique et vérifie les signatures localement. Les reçus HMAC
historiques ne peuvent plus alimenter la plasticité GVX.

Le service écoute en boucle locale par défaut. L'exploitation distante exige TLS et
l'authentification mutuelle. Les vérificateurs métier sont du code statique chargé dans
le service, épinglé par empreinte de module et enregistré sous un digest de confiance.
Le vérificateur d'intégrité seul ne prouve pas la validité d'une métrique ou d'un résultat
métier. Toute exigence sans implémentation dédiée échoue fermée.

## Conséquences

- Le runtime ne possède pas la clé de signature privée.
- Un reçu de développement lie le scope, la voie, le résultat et les paires
  artefact/vérificateur aux preuves vérifiées par le service.
- Le déploiement doit administrer le processus et la clé séparément; la séparation de
  processus seule n'isole pas d'un compte système compromis.
- Le premier benchmark GVX reste `not_run` tant qu'aucun manifeste métier et jeu
  holdout détenu en interne ne sont configurés et exécutés.

## Alternatives

- Garder l'HMAC dans le processus backend : rejeté, car l'identité du vérificateur et la
  capacité à signer restent accessibles au runtime.
- Signer un reçu de développement fourni par le runtime sans vérifier ses preuves :
  rejeté, car cela créerait un oracle de signature.
