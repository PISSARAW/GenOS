# ADR 0383 Construction de workflows canoniques dans Studio

**Statut** : Accepté pour une tranche de construction de workflows.
**Date** : 2026-10-10.
**Domaine** : Studio, construction, versions, exécution et publication.

## Contexte

Studio expose des parcours d'inspection et une boucle de publication locale,
mais ne fournit pas encore le parcours de construction attendu par la cible
STUDIO-TARGET-V1. Les workflows, versions persistées et workers existants sont
les objets canoniques. Une copie locale ne doit pas écraser une version modifiée
entre sa lecture et sa sauvegarde.

## Décision

Ajouter une vue Construire qui sélectionne les workflows du workspace courant,
édite leurs nœuds et liens visuellement ou en JSON, conserve les champs inconnus,
et utilise les API tenant-scoped existantes. Aucun nouveau moteur n'est créé.
La validation serveur et les droits restent obligatoires.

Les sauvegardes et demandes d'exécution Studio transmettent `expectedVersion`.
Une version obsolète reçoit un conflit, sans sauvegarde ni admission de run.
La précondition reste optionnelle pour les clients existants. Le CAS transactionnel
de sauvegarde reste appliqué après cette vérification. Le worker utilise la version
persistée référencée par le run, pas le brouillon local.

Le brouillon reste en mémoire et est protégé avant un changement de contexte.
La déconnexion forcée purge ses données. Un effet HTTP incertain nécessite une
relecture avant toute nouvelle mutation, jamais un retry silencieux.

Un test crée un run en file d'attente, puis observe son état séparément. La vue
n'assimile ni un graphe valide à un comportement correct, ni un run terminé à une
promotion. Le passage vers Publier transmet la version sélectionnée sans figer
ni publier automatiquement une release.

## Conséquences

La première tranche couvre la construction de workflows et leurs prompts de nœuds,
pas un catalogue complet d'agents, de providers, de secrets ou de connecteurs.
Le graphe graphique est limité à 100 nœuds ; le JSON conserve le document entier.
Les essais structurels de qualification n'établissent pas la qualité d'un LLM.
Les autres priorités produit gardent leurs critères de sortie propres.

## Alternatives

- Réécrire le moteur : rejeté, pour préserver versions, scopes et worker existants.
- Afficher seulement du JSON : insuffisant pour la construction visuelle.
- Sauvegarder sans version attendue : rejeté pour éviter l'écrasement d'un travail concurrent.
