# ADR 0347 — Clients Studio et VS Code de référence

**Statut** : Accepté
**Date** : 2026-10-07
**Domaine** : Consommateurs, interfaces et preuves

## Contexte

B06 qualifie les parcours des consommateurs P0. Le backend proposait un
contrat IDE et des APIs Studio sans clients distribuables dans ce dépôt.
Des tests de contrôleur ne prouvaient donc pas un parcours interactif.

Le routage des ressources de mission, monté sous `/api`, plaçait aussi un
middleware administrateur devant toutes les routes suivantes. Une inspection
de run par un opérateur était refusée malgré les permissions de sa route.

## Décision

Livrer un Studio statique sous `/studio/` et un VSIX VS Code sans dépendance.
Ajouter `g inspect-run` pour relire le même dossier authentifié depuis le CLI.
Les assets sont publics ; toutes les données et mutations utilisent les
contrôles d’authentification, de permission et de tenant du backend.
La lecture de référence est limitée à une organisation et un projet explicites.
Elle associe le run, le journal HMAC, l’assemblage AEIS scellé, les liens de
provenance et les mémoires dont les empreintes sont recalculées. Une transaction
fournit une vue cohérente des lectures SQLite. Une altération produit un refus,
sans transformer un statut `completed` en preuve autonome.

Le Studio conserve sa clé uniquement en mémoire et transmet les dossiers
signés à l’approbation existante. VS Code utilise SecretStorage, négocie le
contrat avant connexion et conserve un clientId opaque pour la reconnexion.
Il n’exporte pas la clé de signature et refuse les redirections réseau.

Déplacer le contrôle administrateur des ressources de mission sur chacune de
leurs routes. Toutes conservent ce rôle ; une route étrangère ne reçoit plus
accidentellement ce contrôle. Ne pas élargir les permissions de promotion.

## Validation

Le test API utilise SQLite et des répliques exécutables neuves : isolation,
signature absente, approbation valide et altérations de provenance, journal et
assemblage. Le parcours navigateur agit sur le vrai DOM et capture le rendu.
Le harnais installe le VSIX dans un profil isolé, appelle les commandes dans
l’hôte VS Code réel et vérifie le document ouvert ainsi que l’identité de
reconnexion. Tous relisent le même run et les mêmes liens de provenance.
Le moniteur live affiche seulement les mondes du snapshot. Les rafraîchissements
ne créent plus de progression ; les métriques absentes restent inconnues.
Seul l’événement clavier d’appui est traité, pour éviter une double bascule
lors du relâchement sous Windows. La session native et un test couvrent ce cas.

## Limites

Ces clients couvrent les parcours implémentés de supervision et d’inspection.
Ils ne livrent pas des extensions JetBrains/Antigravity, une synchronisation
de buffers, ni un résultat scientifique généralisable. Les limites du journal
de reprise restent celles de l’ADR 0346. La présence d’un hash de provenance
vérifiable prouve l’intégrité du lien contrôlé, pas la vérité universelle d’une
affirmation ni une garantie de dépôt mémoire sur chaque échec possible.
