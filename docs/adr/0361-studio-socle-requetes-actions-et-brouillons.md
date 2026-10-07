# ADR 0361 — Studio : socle des requêtes, actions et brouillons

- **Statut** : Accepté ; livraison par points B01–B03, qualification bornée.
- **Date** : 2026-10-07.
- **Domaine** : Studio, transport, contexte, erreurs et conservation des entrées.
- **Décideurs** : opérateur et agent de développement.
- **Lié à** : ADR 0350, ADR 0352, ADR 0360 ; STUDIO-TARGET-V1.

## Contexte

L'étape B demandée renforce le socle existant avant de multiplier les capacités.
Le client annule déjà les requêtes à changement de session, mais ne borne pas un
transport ignorant AbortSignal et perd le statut HTTP lorsque le JSON est invalide.
Les boutons sont réactivés sans conserver leur état initial ; certaines erreurs
effacent des brouillons et les changements de contexte peuvent les abandonner.

## Décision

Conserver le client DOM modulaire et les gates serveur. Livrer un commit par point :

- B01 : contrat d'erreur typé, destinations API locales, refus des redirections,
  deadlines englobant le décodage, annulation/session et refus explicites même
  sous HTTP 200. Une mutation sans réponse a un effet inconnu ; aucun retry implicite.
- B02 : conservation des états de contrôles, des vues lors d'erreurs transitoires
  et des entrées de formulaires ; présentation distincte des effets incertains.
- B03 : garde de brouillon pour le fichier édité avant changement de contexte,
  workspace ou déconnexion manuelle ; avertissement avant fermeture. Expiration
  d'authentification et déconnexion forcée restent prioritaires et purgent les données.

La qualification ajoute des probes unitaires et navigateur isolés. Les fixtures UI
ne prouvent ni l'autorité backend ni un effet métier réel. Les tests de services et
les suites globales sont exécutés séparément avec leurs résultats et limites.
Le registre détaillé annoncé après l'étape A reste à produire : la demande actuelle
priorise le renforcement du socle et ne clôture pas cette obligation de couverture.

## Conséquences

### Positives

- Une nouvelle vue réutilise des erreurs et un cycle de requête communs.
- Une session obsolète ne peut pas publier une réponse tardive.
- L'opérateur conserve ses entrées lors d'un échec et distingue refus et incertitude.

### Négatives et limites

- Les erreurs frontend n'annulent ni ne compensent un effet externe déjà appliqué.
- La garde n'est pas une sauvegarde persistante ni une synchronisation collaborative.
- Une mutation HTTP acceptée n'est pas une décision validée ; les preuves restent requises.
- Les capacités GenOS, le registre exhaustif et les zones métier ne sont pas livrés ici.

## Alternatives

- Réécriture SPA : non justifiée pour ces contrats locaux.
- Retry automatique des mutations : rejeté, risque de doublons et d'effets incertains.
- Conservation des drafts après expiration/session étrangère : rejetée pour préserver
  les frontières de session et de tenant.

## Références

- [Contrat directeur](../03-reference/studio-contrat-directeur.md).
- [Suivi et preuves](../06-qualite-preuves/studio-parite-suivi.md).
