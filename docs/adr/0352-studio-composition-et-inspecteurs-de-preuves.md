# ADR 0352 — Studio : composition et inspecteurs de preuves

- **Statut** : Accepté.
- **Date** : 2026-10-07.
- **Domaine** : Studio, ergonomie et composants d’observation.
- **Décideurs** : opérateur et agent de développement.
- **Lié à** : ADR 0348 Studio, ADR 0350 navigation, programme de parité.

## Contexte

Les captures montrent une console verticale : mêmes boutons pour toutes les
actions, empreintes dominantes, éditeur et résultats séparés par le défilement.
La comparaison visuelle précédente porte sur des références sélectionnées,
pas sur un audit exhaustif de toutes les interfaces concurrentes.

## Décision

Conserver le client DOM natif, ses API, ses identifiants de contrôles et les
gates backend. Composer une navigation latérale, une barre de contexte et des
espaces spécialisés : liste/dossier/preuves, supervision/lignée/événements,
explorateur/éditeur/snapshots, observations/actions et comparaison des jobs.

Séparer les primitives de présentation et la comparaison des évaluations.
Les onglets suivent le modèle clavier flèches/Home/End. Les filtres locaux
ne changent pas le scope serveur. Les collections multiples utilisent des
tables ; les identifiants et empreintes sont disponibles sur demande.
Les actions destructrices sont distinctes et gardent leurs confirmations.
Un formulaire d’action se replie après succès, sans supprimer les entrées.

La comparaison aligne les mêmes observations pour deux à huit jobs retournés
par le backend. Les métriques absentes restent inconnues ; aucune victoire,
sortie déterministe ou promotion n’est inférée d’un score. Le graphe ne crée
aucun nœud ; chaque nœud retourné expose un inspecteur accessible au clavier.
La disposition est une grille de présentation, pas une chronologie causale.

## Conséquences

### Positives

- Un contexte unique pour plusieurs vues, sans nouveau framework ni CDN.
- Les preuves et décisions sont visibles à côté du dossier.
- Parcours de sécurité et conservation des brouillons maintenus.
- Vérification navigateur des interactions, du reflow et des règles axe.

### Négatives et limites

- L’éditeur reste UTF-8 et le diff reste ligne par ligne, sans IDE complet.
- La lignée reste bornée, sans moteur de placement DAG, zoom ou pan.
- Les formulaires de protocoles conservent des entrées JSON.
- Aucun workflow canvas, playground, RAG, chat ou connecteur nouveau.
- Axe ne remplace pas un audit WCAG ou un test avec lecteur d’écran.
- Cette refonte ne prouve pas la parité fonctionnelle ou visuelle universelle.

## Alternatives

- Styles seuls : insuffisants pour les relations dossier/preuves et fichier/diff.
- Nouveau frontend indépendant : coût de migration et risque de divergence.
- Données de démonstration dans le produit : rejetées ; fixtures réservées aux tests.

## Références

- [Programme de parité](../06-qualite-preuves/studio-parite-plan.md).
- [Suivi de refonte](../06-qualite-preuves/studio-refonte-visuelle.md).
