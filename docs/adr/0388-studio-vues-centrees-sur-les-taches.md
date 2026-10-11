# ADR 0388 Studio organisé par tâches visibles

**Statut** : Accepté.
**Date** : 2026-10-10.
**Domaine** : Studio, navigation, densité et accessibilité.

## Contexte

Les vues Studio empilent formulaires, données, résultats et explications.
Le constructeur ajoute une configuration de workflow, un inspecteur de nœud,
les connexions, le JSON et les essais sur une seule page. Cette accumulation
oblige à défiler pour trouver une action et affaiblit la hiérarchie visuelle.

## Décision

Chaque espace présente une tâche à la fois. Des onglets séparent l'action,
son résultat et les repères ; un sélecteur équivalent les remplace sur mobile.
Les palettes montrent une seule opération et son formulaire. Les fichiers,
snapshots, comparaisons, essais et JSON disposent de volets distincts.
Le constructeur garde le graphe central et ouvre la configuration du nœud
dans un dialogue accessible, avec seulement les champs pertinents pour son type.

L'enveloppe connectée occupe la hauteur de la fenêtre. Le contexte du projet
et le guide sont des panneaux à la demande, sans agrandir la page.
Le défilement reste disponible dans les collections, éditeurs et volets longs.
Sur mobile ou avec un texte agrandi, cette possibilité protège l'accès aux
contrôles ; aucune règle ne promet qu'un contenu arbitraire tient dans un écran.

Les contrôles existants sont déplacés, pas recréés : valeurs, gestionnaires,
gardes de brouillon et permissions sont conservés. Le changement de volet
n'envoie aucune mutation au runtime. Les passages vers la publication et la
restauration ouvrent explicitement le formulaire ciblé. Les API, scopes,
versions attendues et gates de preuve restent inchangés.

## Conséquences

Les tâches secondaires nécessitent un changement de volet, mais n'occupent plus
l'espace principal. Les onglets utilisent les rôles ARIA, un focus mobile
équivalent et une navigation clavier ; le dialogue se ferme avec Échap.
Une purge de session ferme les panneaux et conserve la purge des données.

La qualification navigateur vérifie l'enveloppe de toutes les vues en
1440 × 900, 1280 × 720 et 390 × 844, le texte agrandi, la conservation des
brouillons et la sélection d'une seule opération. Les parcours de construction,
de restauration et de publication restent vérifiés séparément : une enveloppe
sans débordement ne prouve pas qu'une opération métier est correcte.

## Alternatives

- Réduire les polices : rejeté, car la quantité d'informations reste inchangée.
- Masquer le débordement sans navigation : rejeté, car des contrôles deviennent inaccessibles.
- Supprimer des fonctionnalités : rejeté, car le besoin porte sur leur organisation.
- Tout laisser sous des accordéons empilés : insuffisant pour isoler une tâche dans la fenêtre.
