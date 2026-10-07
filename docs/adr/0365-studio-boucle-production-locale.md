# ADR 0365 — Studio : boucle de production locale

- Statut : Accepté, portée locale à qualifier par tranche.
- Date : 2026-10-07.

## Contexte

L'étape F vise P08, Z16/Z17/Z18/Z20 : publier, observer et améliorer.
Le registre `releases` existe mais son rollback retourne 501 et une métadonnée
`active` ne prouve pas une version servie. Il faut un adaptateur observable.

## Décision

Trois commits : F01 fige une version ; F02 sert via la file workflow existante,
avec revue humaine liée au hash, préconditions CAS et rollback ; F03 relie les
observations et retours d'expérience et qualifie la boucle complète.

Conserver l'identité canonique `releases` et les versions `workflow_versions`.
Ajouter des tables Studio de manifeste, slots staging/production par workflow,
événements attribués, revues, invocations et retours. Leur création est additive
et idempotente à la première requête Studio. Le moteur existant exécute les
`workflow_runs`, avec vérification de la version figée avant exécution.

L'adaptateur est un endpoint authentifié local de mise en file ; il ne déploie
ni serveur cloud ni fournisseur tiers. Une admission n'est pas une exécution.
La production exige une revue explicite bornée dans le temps sur une exécution
staging terminée de la même release. Cela valide une autorisation de publication,
pas la vérité des sorties ni une promotion cognitive.

Le rollback rétablit un pointeur local sous CAS ; il n'annule aucun appel déjà
admis ni effet externe. Le contrôle d'intégrité vérifie manifeste et source,
sans prétendre résister à un administrateur capable de réécrire toute la base.
Scope tenant et permissions restent imposés au serveur. Pas d'override forcé.

## Alternatives et limites

Métadonnée « active » sans invocation : rejetée. Nouveau moteur : rejeté.
Cloud, canary réel, HA, backups globaux, canaux externes et certification globale
C25/C26 ne sont pas établis par cette boucle locale. La couverture complète
STUDIO-TARGET-V1 reste ouverte. Les tests distinguent fixture et effet observé.

## Références

- [Contrat directeur](../03-reference/studio-contrat-directeur.md).
- [Suivi Studio](../06-qualite-preuves/studio-parite-suivi.md).
