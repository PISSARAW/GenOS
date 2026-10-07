# ADR 0363 — Studio : parcours GenOS structurants

- **Statut** : Accepté ; tranches livrées séparément, sans certification globale P04–P07.
- **Date** : 2026-10-07.
- **Domaine** : Studio, mondes, mémoire, AgentDNA et récupération.

## Contexte

Après C, l'opérateur demande D et ses commits. STUDIO-TARGET-V1 fixe P04–P07
mais ne contient pas de points D détaillés. Le Studio possède surtout des
surfaces de gestion/laboratoire. Des endpoints historiques ne conviennent pas
à une exposition directe : inspectNode invente des métadonnées ; certaines
lectures de génome ignorent le scope. Les clones partagent leur workspace.

## Décision

Livrer quatre tranches avec un commit par point :

- D01 : Mondes, checkpoints agent/workspace, référence de branche, clone inactif
  et comparaison, reliés au laboratoire et à la revue existants.
- D02 : Mémoire, décisions sourcées et transmission conservant la provenance,
  sans validation implicite du contenu.
- D03 : Organisme, lecture AgentDNA et mutation candidate native bornée et
  traçable, sans déploiement ou promotion automatique.
- D04 : Diagnostic et reprise, incidents, état et preuves, récupération via
  les snapshots workspace déjà qualifiés.

Réutiliser services et composants, sans moteur parallèle. La façade `/api/studio`
exige un scope explicite même pour l'admin, des permissions serveur et un projet
actif pour écrire. L'identité d'agent vient de la route ; les lectures sont
bornées. Les inconnues restent inconnues. Les actions sont explicites et
confirmées lorsque nécessaire ; lectures/transmissions ne valent pas promotion.
Préserver routes existantes et liens profonds.

## Conséquences

Les concepts ont des parcours observables et réutilisent les états d'erreur,
brouillons et sessions. Chaque tranche est qualifiée sur services réels.
Le clone n'est pas un fork isolé ; une référence de branche ne lance aucun run.
Une transmission ne rend pas une croyance vraie. Une mutation ne prouve pas
un organisme autonome ni un effet cognitif mesuré. Restaurer des fichiers ne
répare pas un effet externe irréversible. Le reste de P04–P07 et G01–G22 demeure
ouvert ; les gates de promotion restent responsables de leurs décisions.

## Alternatives

- Un écran Atlas réputé tout couvrir : rejeté, absence de parcours.
- Exposer tous les endpoints historiques : rejeté, scoping à qualifier.
- Réécrire les moteurs : rejeté, réutilisation des contrats.
- Assimiler clone, snapshot et monde isolé : rejeté, portées différentes.

## Références

- [Contrat directeur](../03-reference/studio-contrat-directeur.md).
- [Suivi](../06-qualite-preuves/studio-parite-suivi.md).
