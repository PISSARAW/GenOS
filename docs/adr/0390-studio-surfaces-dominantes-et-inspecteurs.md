# ADR 0390 Studio : surfaces dominantes et inspecteurs contextuels

**Statut** : Accepté.
**Date** : 2026-10-10.
**Domaine** : Studio, présentation, navigation et accessibilité.

## Contexte

L'organisation par tâches (ADR 0388) évite l'empilement, mais le contexte,
les titres répétés et les commandes secondaires occupent encore le haut
de la fenêtre. La direction visuelle issue des interfaces publiques des
concurrents favorise une surface principale et des détails à la demande.

## Décision

Conserver l'identité navy/mint et regrouper la navigation en Construire,
Exécuter, Explorer GenOS, Publier et Administrer. Les concepts propres à
GenOS restent accessibles : mondes, lignées, mémoire, AgentDNA et reprise.
Déplacer le contexte de projet et l'aide dans l'en-tête compact. Le guide
ne s'ouvre plus automatiquement dans cet en-tête : un changement de hauteur
au pointerdown annulait le clic de connexion avant le submit.

Le constructeur donne la priorité au graphe. La palette est repliable, le
zoom agit sur la taille SVG sans changer le graphe canonique, et le placement
suit les dépendances. Pour un cycle, un placement de repli permet l'inspection
sans prétendre que le workflow est valide. La limite de 100 nœuds reste visible.
Les ports dessinés sont des repères visuels, pas un typage de données.

L'inspecteur de nœud est latéral et non modal sur ordinateur ; il devient
modal sous 1000 px. Il conserve les mêmes contrôles, gardes de brouillon,
gestionnaires et permissions. Échap le ferme et le changement de vue le purge.
Une collection de plusieurs dossiers utilise une liste filtrable et un détail
sélectionné. Les champs autorisés et la provenance restent ceux du rendu existant.
La première colonne de candidats comparés est explicitement la référence ;
aucun score, delta numérique ou verdict de promotion n'est inventé.
Au laboratoire, les résultats consultés/comparés et la dernière réponse d'action
occupent des volets distincts : une ancienne annulation ne s'affiche pas sous
une comparaison nouvellement lue. Les alertes restent dans l'en-tête et ne
recouvrent pas les commandes du contexte de projet.

## Conséquences

La page principale reste bornée à la fenêtre, avec défilement local pour les
graphes, collections et longs formulaires. Sur petit écran, le sélecteur de
navigation remplace les groupes de liens. Les popovers n'agrandissent pas la page.
Cette présentation ne crée ni capacité backend ni preuve de parité fonctionnelle
avec tous les concurrents. Les API, versions et gates restent inchangés.

Les tests vérifient le placement immuable du graphe, les parcours réels de
construction, les changements de contexte et les bounds desktop/mobile/texte
agrandi. Une capture prouve une présentation, pas la qualité d'un modèle ou une
promotion. Les rapports avec empreintes de sources et captures restent sous
`.genos-tests/`, non versionnés. Les échecs liés au binaire natif ou aux permissions
doivent être distingués des régressions d'interface.

## Alternatives

- Copier les marques concurrentes : rejeté, l'identité GenOS est conservée.
- Ajouter des boutons sans API : rejeté, aucun faux fonctionnement.
- Superposer un dialogue sur le graphe desktop : remplacé par un inspecteur latéral.
- Supprimer le défilement local : rejeté, les grands contenus doivent rester accessibles.
