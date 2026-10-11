# ADR 0397 — Perception native et révision du prompt local

## Statut

Accepté, avec promotion des résultats révisés encore bloquée.

## Date

2026-10-10

## Domaine

Workers, perception continue, exécution locale.

## Décideurs

Équipe GenOS.

## Lié à

[ADR 0396](0396-observation-continue-des-workers-supervises.md).

## Contexte

La campagne précédente observait deux changements de dépendance pour 17 des
19 types de workers. `procedural_executor` et `formal_worker` exécutent une
méthode native dans le backend et ne traversent pas le superviseur de processus.
Pour les 17 autres types, l'observateur du backend ne livrait aucun changement
au processus enfant du modèle local.

## Décision

Une méthode native peut garder un observateur actif pendant une fenêtre bornée,
explicitement demandée par `continuousExecution.observationWindowMs`. Les
missions natives qui omettent cette fenêtre sont refusées. Les observations
sont liées au run et persistées avant le résultat. En mode
`control`, un changement empêche la publication du résultat natif.

Le superviseur transmet aux processus locaux par IPC les reçus des fichiers
déclarés : chemin relatif, empreinte, révision et référence de preuve. Le
runtime reconstruit son prompt avec ces reçus et relance une génération si
une révision est arrivée pendant la précédente, dans une limite de quatre
tentatives. Une génération révisée doit citer exactement la dernière référence
de preuve ; sinon elle est retentée dans la même limite, puis refusée. Il
publie la révision utilisée et un reçu de génération. Le budget de latence
reste commun à ces tentatives.

Les événements de perception et de révision sont exclus de la mesure des
boucles d'actions du Swarm Sentinel : leur alternance provient du superviseur.

## Conséquences

### Positives

Les méthodes natives peuvent témoigner de changements durant une mission.
Le processus local reçoit les empreintes pendant son exécution et peut
reconstruire un prompt avant une nouvelle génération.

### Négatives

La fenêtre native allonge explicitement la mission. Les empreintes ne donnent
pas au modèle le contenu du fichier. La porte `control` conserve son
invalidation historique après changement : une génération révisée ne suffit
pas à promouvoir le résultat. La présence d'un reçu de génération ne prouve
pas à elle seule que la réponse exploite correctement l'observation.

## Alternatives

Exécuter les méthodes natives dans un processus supervisé aurait changé leur
contrat d'exécution. Donner un accès direct aux fichiers au modèle aurait
élargi sa capacité et ses risques ; cette décision transmet uniquement des
reçus bornés des dépendances déclarées.
