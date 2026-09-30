# 0182 — Navigation web et vision fovéale par session explicite

- **Statut** : Proposé — intégration expérimentale.
- **Date** : 2026-09-30.
- **Domaine** : Backend, navigation, perception, preuves.
- **Décideurs** : Mainteneurs GenOS.
- **Lié à** : `docs/01-concepts/biomimetisme/web-foraging.md`.

## Contexte

Les services de scout, de foraging et de fovéation étaient isolés. Une
navigation HTML simulée ne fournit ni session de navigateur, ni capture réelle;
le service fovéal écrivait un manifeste plutôt qu'une image découpée. La
capacité doit relier une observation à l'action suivante et préserver la
provenance sans présenter une simulation comme preuve d'exécution.

## Décision

- Conserver le chemin HTML synthétique pour les tests unitaires et ajouter un
  adaptateur Puppeteer activé par l'ouverture explicite d'une session navigateur.
- Bloquer les protocoles autres que HTTP(S), les identifiants intégrés aux URL,
  les adresses locales et les réseaux privés. Les tests de navigateur peuvent
  autoriser un hôte local explicitement.
- Capturer un screenshot après navigation et action; dériver le gain observé
  de la nouveauté lexicale entre états réels de la même session.
- Recadrer les pixels avec Sharp en coordonnées normalisées ou pixels validés.
  Le recadrage conserve la résolution source et ne revendique pas de DPI ni de
  détail inféré par agrandissement.
- Relier décision, état observé, navigation et hash du recadrage par un reçu.
  Les leases autorisent l'appel; elles ne valident pas la qualité sémantique.
- Garder l'évaluation GAIA distincte. Aucun résultat GAIA n'est établi par la
  présence du lanceur ou des tests synthétiques.

## Conséquences

L'adaptateur requiert un Chromium Puppeteer disponible. L'accès réel reste
conditionné par les permissions réseau de l'environnement. Les ROIs web sont
des heuristiques génériques et le gain lexical n'est pas une mesure de vérité
ou de valeur de réponse; les reçus doivent conserver ces limites.

## Validation requise

Exécuter `node backend/tests/test_browser_runtime.js` dans un environnement où
Chromium peut démarrer, puis conserver les artefacts d'une tâche web réelle.
N'annoncer une validation GAIA qu'avec une exécution effective, une version de
modèle, les données, la commande et les résultats produits.
