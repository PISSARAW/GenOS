# Protocoles spécialisés dans l'exécuteur natif Rust

**Statut** : Accepté pour le profil natif borné integer_sum
**Date** : 2026-11-02
**Domaine** : Runtime Rust, protocoles, processus et publication CAS
**Décideurs** : Mainteneurs GenOS
**Lié à** : [Référence native](../03-reference/protocoles-missions-rust.md),
[qualification](../06-qualite-preuves/protocoles-runtime-rust-2026-11-02.md)

## Constat

Le CLI `run --mission` utilisait un pont Node, suivi d'un vérificateur SQLite
Rust. Les cycles de `genos-worker` et les concepts biologiques ne constituaient
pas un exécuteur métier Rust. Les protocoles ne peuvent pas être déclarés actifs
en ajoutant seulement des traces à ces modèles.

## Décision

Un exécuteur natif de `genos-orchestrator::mission_protocols` consomme un domaine
installé de `genos-worker::native`. La sélection CLI est `--executor rust`.
Chaque mission native passe obligatoirement par les sept frontières. Le pont
Node reste identifié séparément, sans repli implicite en cas de refus natif.

Le premier domaine est `integer_sum` : lecture d'un fichier JSON de 1 à 4096
entiers entre -1000000 et 1000000, calcul dans un processus producteur puis
vérification dans deux autres processus Rust par des algorithmes différents.
La preuve concerne cette somme et cet objet observé ; elle ne certifie pas une
consigne libre ni un modèle de langage. Les exécutables sont ceux de
l'installation locale, jamais une commande choisie dans la mission.

La racine locale et le journal SQLite sont de confiance opérateur. Ce profil
n'est ni un service multi-tenant authentifié ni une frontière contre un
administrateur hostile du disque. Les chemins clients restent confinés, les
liens sont refusés et les processus natifs n'exécutent ni shell ni outil libre.

Le binding durable lie mission, workspace canonique, incarnation, génération,
requête, politique, empreinte du binaire et échéance. Chaque mutation contrôle
ce binding dans une transaction `IMMEDIATE`. Le contrôle d'incarnation demeure
hors des checkpoints. Un compteur local ou un identifiant de lease textuel ne
remplace pas ce contrôle.

## Points de livraison

1. Socle durable, binding, domaine natif et reçus de processus non forgeables
   depuis une réponse JSON.
2. EVIDENCE : prédicat demandé, trois exécutions et dossier courant exact.
3. CONTINUITY : générations, checkpoints et refus d'effets inconnus.
4. MORPH : installation transactionnelle de la roster réellement consommée.
5. OMEGA : graphe installé, intentions et effets observés sans redispatch.
6. GQWF Exchange : objets CAS, fermeture et publication de tête atomique.
7. SYNAPSE : contextes appliqués puis relus avant chaque entrée de worker.
8. ALLOSTASIE : exposition avant lancement, temps réel et réserve protégée.
9. Raccordement obligatoire au CLI et au lancement natif de mission.
10. Qualification de bout en bout, concurrence et reprise de processus.

Les commits suivent les dépendances entre points. SYNAPSE précède ainsi la
porte EVIDENCE qui relit les contextes, et GQWF suit les preuves et OMEGA.

## Bornes

MORPH installe une organisation locale ; aucun quorum distant READY n'est
inventé. GQWF échange les objets entre namespaces CAS locaux et publie le
résultat dans SQLite ; il ne prétend pas synchroniser un filesystem distant.
SYNAPSE utilise la représentation canonique du domaine, sans annoncer un
dialecte interopérable supplémentaire. ALLOSTASIE mesure les processus et leur
temps mural, avec réserve de 5 %, sans convertir l'ATP en tokens modèle ou USD.
Une issue inconnue conserve l'exposition et interdit la relance automatique.
Ces adaptateurs ne transforment pas les anciennes simulations biologiques en
exécutions métier ni tous les workers Node en implémentations Rust.
