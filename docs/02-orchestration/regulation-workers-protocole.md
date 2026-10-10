# Protocole de validation de la régulation des workers natifs

- **Type** : preuve expérimentale et plan de validation
- **Statut** : partiel, régulation autonome non démontrée
- **Portée** : les 19 types de `workerKindService.KINDS` dans `runDeterministicWorker`
- **Dernière revue** : 2026-10-10

## Observation reproductible

Sur la révision `f1563cb8`, la sonde [`test_real_worker_regulation.cjs`](../../backend/tests/probes/test_real_worker_regulation.cjs) crée une base SQLite isolée, instancie chaque vrai worker avec son contrat natif, puis appelle le runtime réel. Le parent, la mission et les contrats sont préparés par la sonde ; la planification complète n'est pas couverte. Le `sub_orchestrator` délègue à un véritable enfant. Les événements de démarrage, de preuve et de fin sont vérifiables par [`audit_real_worker_regulation.py`](../../backend/tests/probes/audit_real_worker_regulation.py).

Chaque état initial est perturbé à énergie 0,2 ; intégrité 0,3 ; survie 0,8 ; stress 0,9 ; cortisol 0,9. La sonde vérifie énergie ≥ 0,4, intégrité ≥ 0,5, survie < 0,7 et stress ≤ 0,7 après le run. Les seuils reflètent les branches actuelles de `regulatoryStateService`, sauf celui de l'intégrité qui correspond au choix `RECOVER`. Ils constituent une hypothèse de test, pas encore un contrat produit approuvé.

Résultat : **19/19 runs terminés ; 0/19 états corrigés ; 0/19 révisions modifiées pendant les runs**. Les 19 triplets d'événements sont persistés. Un appel explicite à `applyRpe(+1)` après les runs réduit le stress de 0,9 à 0,85 et augmente la révision de 1 à 2 : le témoin prouve que la sonde détecte une mise à jour. La réussite du worker signifie donc exécution de méthode et preuve, pas retour dans une plage fonctionnelle.

Les six tests de service dans [`test_regulatory_services.cjs`](../../backend/tests/probes/test_regulatory_services.cjs) ont relevé trois autres écarts : un RPE nul augmente stress et cortisol ; les retours positifs répétés ne restaurent ni énergie ni intégrité ; `validateSnapshot` accepte une énergie négative, contrairement à [`regulatory-snapshot.schema.json`](../../spec/regulatory-snapshot.schema.json). Ces observations sont distinctes de la matrice des workers.

## Reproduction

Depuis la racine du dépôt, avec les dépendances installées :

```powershell
node --test backend/tests/probes/test_regulatory_services.cjs
node backend/tests/probes/test_real_worker_regulation.cjs
python backend/tests/probes/audit_real_worker_regulation.py
```

Les deux commandes Node renvoient actuellement le code **1** : trois tests de service échouent et le critère fonctionnel des workers échoue. La commande Python vérifie les événements enregistrés. Les bases et JSON sont écrits dans `backend/tests/probes/.regulation-results/`, exclu de Git. `GENOS_REGULATION_OUTPUT_DIR` peut déplacer ce dossier. Des auxiliaires peuvent signaler un tick après fermeture de la base ; l'audit doit être effectué avant d'interpréter ce signal comme un échec des runs.

## Travail nécessaire pour une réussite complète

1. **Fixer le contrat de régulation.** Définir par variable la plage, la source de mesure, la durée maximale hors plage, les perturbations admissibles et le comportement si la récupération est impossible. Préciser ce que signifie « régulé » pour chacun des 19 types, y compris un worker sans action réparatrice propre et l'enfant du `sub_orchestrator`.
2. **Rendre l'état fiable.** Valider le snapshot avec le schéma complet, traiter le RPE nul comme neutre, persister l'état et sa révision par agent, puis vérifier la reprise après redémarrage et les écritures concurrentes.
3. **Fermer la boucle sur le chemin natif.** Lire l'état avant et après l'action, relier un reçu vérifié à un changement mesurable, appliquer les transitions autorisées et repasser par les garde-fous existants. La boucle doit pouvoir choisir une récupération, une conservation ou un arrêt sûr. Elle ne doit jamais augmenter artificiellement énergie ou intégrité juste pour satisfaire le test ; une restauration doit être étayée par une ressource ou un acte réparateur.
4. **Exercer les 19 types sous perturbations.** Vérifier plusieurs cycles, des seuils proches, des perturbations combinées, les échecs de méthode, l'épuisement du budget, la concurrence, la reprise SQLite et la délégation réelle. Chaque run doit fournir l'état initial, les actions, les reçus, les révisions et l'état final.
5. **Poser le critère de sortie.** Pour chaque cas récupérable et chaque type : retour dans les plages dans le délai contractuel, avec preuves et sans contournement d'autorité. Pour chaque cas non récupérable : arrêt ou escalade documenté, sans fausse déclaration de succès. Exiger 19/19 types couverts, puis la matrice native, le gate qualité, les suites Node et Rust pertinentes.

L'actuel `deterministicWorkerRuntime` exécute la méthode, publie la preuve et marque le run terminé sans appel au service régulatoire. Le point d'intégration candidat est le cycle de publication des reçus et de fin de run ; le choix exact doit préserver les contrôles d'autorité et les contrats de preuve.
