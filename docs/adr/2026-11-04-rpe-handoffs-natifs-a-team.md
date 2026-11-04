# ADR — RPE sur les handoffs natifs A-Team

- **Statut :** raccord Node local implémenté, qualification réelle requise.
- **Date :** 2026-11-04.
- **Portée :** admission, consommation et clôture des handoffs A-Team.

## Contexte

L'expérience du Dernier Sas avait appelé le noyau RPE pour une lecture locale
du rapport initial. Cette opération ne contrôlait ni les contributions des
workers ni leur transmission à l'intégrateur. Un registre relationnel présent
dans le dépôt ne démontre aucune restriction effectivement appliquée.

## Décision

Une mission peut déclarer `relationalPolicy: {version: 1, required: true}`.
La politique est conservée dans le TeamRun canonique, participe à son empreinte
d'idempotence et ne peut être supprimée ou remplacée pendant son exécution.
L'absence d'option conserve le parcours historique ; une qualification intégrée
exige explicitement cette politique.

Avant de lancer un consommateur, le scheduler recharge le WorkGraph, les
membres, le tenant, la mission active et les autorités natives. Seul un handoff
canonique disponible, issu du dernier run réellement terminé du producteur,
peut être admis. Le reçu natif de complétion est vérifié ; un statut SQL isolé
ou une déclaration du modèle ne suffit pas.

L'orchestrateur transmet les données de son producteur au consommateur sous sa
propre autorité existante. Les agents et relations sont chargés depuis SQLite
dans leur portée réelle. Leur projection décrit les rôles runtime plutôt que
les intitulés libres de spécialité. Une relation aveugle directe entre les deux
workers force également l'aveuglement de ce transfert contrôlé par le parent.
Les références typées distinguent artefact, conclusions et contexte.

Le noyau RPE évalue la demande à l'intérieur d'une transaction du plan de
contrôle. Une évaluation et son admission sont conservées dans un reçu HMAC
avant le lancement. Les relations ne confèrent aucun droit : les destinataires
et les références autorisées viennent exclusivement de la dépendance et du
dossier natifs déjà vérifiés.

Si le plan réduit retire une partie du handoff que son contrat typé exige, le
scheduler refuse le transfert avec `ATEAM_RPE_HANDOFF_REPLAN_REQUIRED`. Il ne
livre pas le contenu original sous une étiquette « filtrée ». La modification
partielle de l'interface exige une replanification explicite. Le transport RPE
général conserve ses propres possibilités de projection ; ce raccord protège
la livraison entière liée à son digest et à son contrat d'acceptation.

Le worker reçoit une référence de reçu dans son véritable contexte de handoff.
Avant toute génération, il vérifie la signature, l'identité, le digest intégral,
le tenant, la politique relationnelle actuelle, l'autorité et le run source.
La première consommation lie irréversiblement cette admission à son run natif.
Une autre tentative d'exécution exige une nouvelle admission, distinguée par
l'époque d'exécution précédente du consommateur. Aucun ACK sémantique positif
n'est généré par l'adaptateur.

La clôture exige le véritable acquittement du consommateur, son run terminé,
la preuve native de complétion, le contexte réellement présenté au modèle et
le reçu de consommation authentifié. Le scellement du run doit suivre
l'admission et précéder son expiration. L'invariant
`relational_handoffs_verified` s'ajoute aux critères de qualité et de promotion
existants. Un reçu de transport ne vaut jamais validation du scénario.

## Limites

Ce raccord porte sur les données de handoff des A-Team locales. Il ne qualifie
pas tous les exécuteurs ni toutes les formes de délégation de GenOS. Les
politiques de vérification indépendante restent distinctes : deux relecteurs
du même modèle ne deviennent pas indépendants par une relation sociale.
L'autorité native recontrôle aussi l'incarnation, le confinement et les leases
au lancement. La transaction d'admission n'est pas présentée comme un verrou
distribué couvrant une inférence entière.

Les tests doivent exécuter les contrôles d'autorité réels et refuser une source
simplement marquée terminée, la substitution de contenu, une identité étrangère,
une relation aveugle incompatible, un reçu absent et son rejeu entre deux runs.
La campagne réelle doit ensuite démontrer consommation et ACK sur les workers
effectivement exécutés avant de revendiquer une intégration complète.
