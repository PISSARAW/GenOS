# Audit de complétude — concepts 16 à 19

Date : 2026-10-12. Périmètre : les 16 entrées du biomimétisme spécialisé, les 24 entrées AEIS, les 9 familles et 14 concepts transversaux de nosologie, puis les 68 entrées de philosophie (dont trois doublons de libellé entre concepts et écoles). **131 entrées évaluées individuellement.** Le fichier d'origine de l'inventaire est `Texte collé.txt` fourni avec la demande.

## Méthode et limites

Chaque ligne donne cinq verdicts : **I** (implémenté), **V** (vérifié par un contrôle exécuté et son résultat), **D** (démontré par un scénario rejouable produisant une observation), **U** (utilisable via une surface intégrée), **Doc** (documenté). `O` = oui dans la portée logicielle indiquée ; `P` = partiel ; `N` = non ; `?` = preuve inconnue. La complétude exige cinq `O` **sur la portée promise**. Un registre, alias, test non exécuté, scénario planifié ou texte descriptif ne vaut pas implémentation ni démonstration. Les simulations locales ne démontrent pas un effet sur une mission réelle. Les résultats historiques cités dans le dépôt sont marqués `P` lorsqu'ils n'ont pas été rejoués ici.

Contrôles exécutés dans ce checkout : `node backend/tests/test_nosology_catalog.js` → PASS ; `node backend/tests/test_philosophy_registry_health.js` → 375 concepts et 100 contrats de réponse PASS ; `node backend/tests/test_philosophy_executable_contracts.js` → 375/375 contrats et 13 500 cas simulés PASS, 0 mission réelle ; `node backend/tests/test_philosophy_falsification.js` → PASS ; `node backend/tests/test_aeis_e2e.js` → tous les cas PASS, dont claim faux refusé ; `node backend/tests/test_aeis_homeostatic_arbitration.js` → PASS ; `node backend/tests/test_optimal_foraging.js` → quatre scénarios PASS. `node backend/tests/test_foraging_browser_runtime.js` échoue au lancement de Chromium (`Code: 3221225506`) dans cet environnement : le parcours navigateur historique documenté n'a pas été reproduit ici. Ces résultats n'établissent pas la réussite de `npm test`, de `cargo test --workspace`, ni des suites spécialisées complètes. Le dépôt comportait déjà de nombreuses modifications concurrentes ; l'audit décrit le checkout observé.

### Références de preuve réutilisées

- **B1** : [foraging web et limites](../01-concepts/biomimetisme/web-foraging.md#L8), [service de Charnov](../../backend/src/services/foragingScoutHarvesterService.js#L34), [test local](../../backend/tests/test_optimal_foraging.js) et [scénario navigateur](../../backend/tests/test_foraging_browser_runtime.js). Le document affirme un parcours sur serveur local et l'absence de score GAIA.
- **B2** : [sens animaux et limites](../01-concepts/biomimetisme/sens-animaux.md#L3), [modules sensoriels Rust](../../crates/genos-biology/src/sensory/mod.rs), [CLI](../../crates/genos-cli/src/commands/biomimicry_sensory.rs). Vecteurs synthétiques fournis par l'appelant, sans capteur de mission.
- **B3** : [cellules spécialisées et limites](../01-concepts/biomimetisme/cellulaire-specialise.md#L3), [code Rust](../../crates/genos-biology/src/specialized_cells/), [filtrage MCP](../../backend/src/services/mcpLigandReceptorService.js). Branches partielles ; l'électrocyte sous quorum n'est pas relié au dispatcher MCP/CLI.
- **B4** : [primitives animales](../01-concepts/biomimetisme/primitives-controle-animal.md#L13), [handlers](../../backend/src/services/primitiveHandlers/animalControl.js), [test](../../backend/tests/test_animal_control_primitives.js).
- **B5** : [registre d'alias](../../backend/src/services/ontogenesis/canonicalConceptAliases.js#L225) : un alias ne constitue aucune preuve de capacité ; [test boucle web](../../backend/tests/test_web_sensorium_loop.js).
- **A1** : [contrat AEIS](../01-concepts/adaptive-epistemic-immune-system.md#L113), [architecture](../01-concepts/adaptive-epistemic-immune-system.md#L258), [qualification](../01-concepts/adaptive-epistemic-immune-system.md#L457) ; [suite](../../backend/tests/run_aeis_suite.js).
- **A2** : [reçus et assemblées de promotion](immunite-epistemique.md#L29), [test E2E exécuté](../../backend/tests/test_aeis_e2e.js) ; HMAC conditionné à une clé opérateur, quorum de vérificateurs et refus d'une claim fausse.
- **A3** : [homéostasie et ré-arbitrage](../../backend/src/services/epistemic/epistemicHomeostaticRearbitration.js#L11), [routage des vérificateurs](../../backend/src/services/epistemic/verifierRuntimeBridge.js#L241), [pont stigmergique](../../backend/src/services/epistemic/stigmergyInterProcessBridge.js#L82).
- **N1** : [contrat canonique des 28 conditions et 9 familles](../../shared/nosology.json), [catalogue généré](../01-concepts/nosologie/catalogue-runtime.md#L1), [application des marqueurs](../../crates/genos-biology/src/therapy_dispatch.rs), [test catalogue exécuté](../../backend/tests/test_nosology_catalog.js).
- **N2** : [validation historique et limites](validation-nosologie.md#L1), [vue d'ensemble](../01-concepts/nosologie/vue-ensemble.md), [contrat des pathologies](../../crates/genos-cell/src/nosology.rs) ; le parcours HTTP → Rust → journal après redémarrage y est explicitement non validé.
- **P1** : [registre et limites](../03-reference/registre-philosophique.md#L17), [définitions](../../backend/src/philosophy/conceptDefinitions.js#L112), [profils](../../backend/src/philosophy/operationalProfiles.js), [test de santé exécuté](../../backend/tests/test_philosophy_registry_health.js).
- **P2** : [contrats et démonstrations simulées](../03-reference/registre-philosophique.md#L34), [matrice opérationnelle](../03-reference/matrice-operationnelle-philosophique.md#L1), [garde de non-promotion](../../backend/src/services/philosophicalPromotionGuard.js), [test de falsification exécuté](../../backend/tests/test_philosophy_falsification.js). Les graphes simulés ne sont pas des missions réelles.
- **P3** : [services des mondes possibles](../../backend/src/services/ontology/possibleWorldService.js#L62), [logique modale](../../backend/src/services/modalLogicService.js#L21), [continuité](../../backend/src/services/ontology/continuityService.js#L70), [temps et identité](../../backend/src/services/temporalIdentityService.js#L186).
- **P4** : [services de réalisme spéculatif](../../backend/src/services/ontology/speculativeRealismService.js#L27), [propriétés de deuxième ordre](../../backend/src/services/ontology/metaphysicsService.js#L90), [tout/vide/infini](../../backend/src/services/ontology/wholeVoidInfiniteService.js#L25), [autrui](../../backend/src/services/ontology/personOtherService.js#L6).

## 16. Biomimétisme spécialisé

| Concept | I | V | D | U | Doc | Preuve et lacune déterminante |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Foraging de Charnov | O | O | P | P | O | B1 : seuil MVT, décision et MCP démontrés localement ; scénario navigateur non rejoué (Chromium ne démarre pas). |
| Fovéation | O | P | P | O | O | B1 : crop Sharp de pixels réels et outil ; test dédié non rejoué ici, ROI heuristique. |
| Perception active | P | P | P | P | O | B1/B4 : capture après action et primitives ; boucle générale mission non établie. |
| Navigation active | P | P | P | P | O | B1 : session Puppeteer locale ; généralisation à des sites externes non démontrée. |
| GAIA | N | ? | N | N | O | B1 : harnais et données externes requis ; aucun score GAIA GenOS établi. |
| Olfaction | P | P | P | P | O | B2 : VNO calculé sur vecteur fourni, pas capteur branché au runtime. |
| Électroréception | P | P | P | P | O | B2 : calcul local synthétique ; pas de réception de signal réel. |
| Magnétoréception | P | P | P | P | O | B2 : distance angulaire locale, pas détection de dérive sémantique. |
| Écholocation | P | P | P | P | O | B2 : échos fournis, sans acquisition ni action incarnée. |
| Vision polarisée | N | ? | N | N | P | B3/B5 : aucun transducteur de polarisation repéré ; l'iridophore rend du texte et l'alias ne crée pas un sens. |
| Cellules balistiques | P | P | P | P | O | B3 : filtre cnidocyte avant transport MCP ; portée limitée à la règle locale, pas WAF général. |
| Électrocytes | P | P | P | P | O | B3 : estimation exposée ; décharge sous quorum Rust non reliée au dispatcher. |
| Cellules osmotiques | P | P | P | P | O | B3 : ouverture de cellule de garde calculée, sans backpressure réelle. |
| Organismes acaryotes | P | P | P | P | O | B3 : transfert procaryote local, sans lease ni révocation runtime. |
| Primitives de contrôle animal | O | P | P | O | O | B4 : handlers et dispatch sous lease ; preuve d'une boucle animale globale absente. |
| Sensorium incarné | P | P | P | P | P | B5 : observations web mémorisées et adaptateur multimodal ; boucle capteur/action/vérification unifiée non établie. |

## 17. Système immunitaire épistémique adaptatif (AEIS)

| Concept | I | V | D | U | Doc | Preuve et lacune déterminante |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Antigène épistémique | O | O | O | O | O | A1/A2 : claim liée au FormalResult avant vérification, E2E rejoué. |
| Immunité innée | O | P | P | O | O | A1 : préfiltrage local ; suite spécialisée non rejouée ici. |
| Immunité adaptative | O | O | O | O | O | A1/A2 : vérificateurs et refus E2E d'une claim fausse. |
| Anticorps spécialisés | P | P | P | P | O | A1 : catalogue/adaptateurs spécialisés ; spécificité évaluée sur domaines bornés. |
| Sélection clonale | P | P | P | P | O | A1 : clones de stratégie exécutés avec oracle ; pas de réplication biologique. |
| Maturation d’affinité | P | P | P | P | O | A1 : mutation ciblée après oracle ; efficacité causale sur corpus externe non démontrée. |
| Mémoire immunitaire | O | P | P | O | O | A1/A2 : mémoire persistée sous portée ; reprise et apprentissage spécialisés non rejoués. |
| Inflammation | O | P | P | O | O | A1/A3 : pression et tiers calculés ; bénéfice sur missions non mesuré. |
| Homéostasie de l’effort | O | O | P | O | O | A3 : budget et retour d'évidence gouvernent le recrutement ; test ciblé PASS, effet en mission non mesuré. |
| Tolérance | P | P | P | P | O | A1 : prévention de sur-réaction décrite ; preuve E2E dédiée absente de cette passe. |
| Régulateur T | P | P | P | P | O | A1 : rôle de contrôle logiciel ; pas de module autonome équivalent à une cellule T. |
| Apoptose épistémique | P | P | P | P | O | A1/A2 : révocation d'autorité ; processus externes déjà lancés non tués. |
| Biocénose cognitive | P | P | P | P | O | A1 : intégration à la délibération collective ; effet AEIS isolé non démontré. |
| Métapopulation épistémique | P | P | P | P | O | A1 : runner isolé disponible ; résultat interprocessus spécialisé non rejoué. |
| Stigmergie épistémique | O | P | P | O | O | A3 : dépôt/lecture de phéromones persistées ; bénéfice collaboratif non mesuré. |
| Holobionte épistémique | P | O | P | O | O | A2 : adaptateur Holobionte → FormalResult exercé dans E2E ; totalité de la topologie non démontrée. |
| Challenge immunitaire | P | P | P | P | O | A1 : contre-exemples et challenge bornés ; couverture d'attaque externe non établie. |
| Reçus AEIS | O | O | O | O | O | A2 : reçu signé immuable, altération rejetée en E2E ; clé opérateur requise. |
| Assemblées AEIS | O | O | O | O | O | A2 : assemblée calculée en E2E, absence bloquante pour la gate. |
| Oracle scellé | P | P | P | P | O | A1/A2 : oracles/receipts liés ; indépendance et scellement hors processus restent conditionnels. |
| Calibration des faux positifs et faux négatifs | P | P | P | P | O | A1 : campagnes locales ; taux sur distribution réelle inconnus. |
| Revue multi-fournisseur | O | O | O | P | O | A2 : configuration sans quorum refusée E2E ; démonstration avec fournisseurs distincts réels non constatée ici. |
| Feedback immunitaire | O | P | P | O | O | A3 : pression ajustée par delta de preuve ; effet de long terme non mesuré. |
| Ré-arbitrage de promotion | O | O | P | O | O | A3 : vérificateur additionnel sous pression vérifié par test ciblé PASS ; scénario de mission indépendante absent. |

## 18. Nosologie computationnelle

Les neuf familles sont effectivement représentées par le contrat de marqueurs de N1. Les noms biologiques sont des étiquettes de **conditions logicielles simulées**. Chaque famille dispose de types et de transformations, mais la démonstration du parcours complet HTTP → Rust → journal restauré manque selon N2.

| Concept | I | V | D | U | Doc | Preuve et lacune déterminante |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Maladies auto-immunes | O | O | P | P | O | N1 : quatre conditions, marqueurs et thérapies ; pas de parcours mission restaurée. |
| Maladies dégénératives | O | O | P | P | O | N1 : Alzheimer, Parkinson, arthrose ; mécanismes détaillés des récits restent analogiques. |
| Maladies infectieuses | O | O | P | P | O | N1 : quatre conditions ; pas de propagation pathogène réelle démontrée. |
| Maladies génétiques | O | O | P | P | O | N1 : trois conditions ; correction de marqueurs, pas édition génomique effective. |
| Cancers | O | O | P | P | O | N1 : trois conditions ; thérapies simulées sur marqueurs. |
| Maladies métaboliques | O | O | P | P | O | N1 : trois conditions ; portée limitée aux marqueurs cliniques. |
| Maladies cardiovasculaires | O | O | P | P | O | N1 : trois conditions ; aucun système de perfusion réel. |
| Maladies psychiatriques | O | O | P | P | O | N1 : trois conditions ; mesures logicielles, pas diagnostic clinique. |
| Maladies environnementales | O | O | P | P | O | N1 : deux conditions ; exposition externe non instrumentée. |
| Pathologie du runtime | P | P | P | P | O | N2 : type `Pathology` et marqueurs ; couverture des pannes de production non établie. |
| Dérive | P | P | P | P | O | N2 : marqueurs/diagnostics partiels ; causalité d'une dérive de mission non démontrée. |
| Défaillance | P | P | P | P | O | N2 : états de panne et refus ; catalogue clinique ne couvre pas les pannes générales. |
| Maladie nosocomiale | N | ? | N | N | P | N2 : terme dans les récits, pas de condition nosocomiale du catalogue N1. |
| Maladie iatrogène | P | P | P | P | O | N1/N2 : effets secondaires conditionnels bornés ; scénarios narratifs plus riches non exécutés. |
| Diagnostic | O | P | P | P | O | N1 : `diagnose_markers` et synchronisation ; pas de chaîne HTTP complète rejouée ici. |
| Thérapie | O | P | P | P | O | N1/N2 : application bornée et autorisation ; restauration globale non validée. |
| Pharmacopée | P | P | P | P | O | N1 : 59 variantes et 48 opérateurs de marqueurs ; pharmacologie analogique non implémentée. |
| Circuit breaker | O | P | P | O | O | N2 : garde de runtime distincte du catalogue nosologique ; scénario de panne complet non audité ici. |
| Immunité graduée | P | P | P | P | O | N2 : politiques de réponse graduée ; lien automatique avec les neuf familles non établi. |
| Quarantaine | P | P | P | P | O | N2 : isolement de cellule et de sécurité ; confinement transversal non démontré. |
| Réparation | P | P | P | P | O | N1 : modification de marqueurs ; réparation d'artefact/runtime non prouvée par la nosologie. |
| Récupération | P | P | P | P | O | N2 : restauration testée par fragments historiques ; parcours bout en bout non validé. |
| Autopsie causale | P | ? | ? | P | P | [preset forensic](../../crates/genos-worker/src/presets.rs#L201) : contrat de worker, sans autopsie causale nosologique exécutée dans cette passe. |

## 19. Mondes possibles et philosophie opérationnelle

Le registre contient **375 concepts** et des audits bornés ; la commande `node backend/tests/test_philosophy_executable_contracts.js` a passé **375/375 contrats, 13 500 cas simulés**, avec **0 validation sur mission réelle**. Pour les notions suivantes, `I=P` signifie qu'il existe une représentation, un service borné ou un contrat exécutable, **pas** une implémentation exhaustive de la théorie. `V=P` distingue ce contrôle collectif des tests propres à chaque notion. `D=P` indique une démonstration simulée sans observation indépendante de mission. Les écoles sont évaluées individuellement, même lorsqu'un concept du même nom figure déjà plus haut.

| Concept | I | V | D | U | Doc | Preuve et lacune déterminante |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Ontologie | P | P | P | O | O | P1 : registre/routeur et services bornés ; ontologie générale non close. |
| Être | P | P | P | O | O | P1 : `ontology.being` et `ontologyCore`, abstraction logicielle. |
| Substance | P | P | P | O | O | P1 : service de substance, interprétation bornée. |
| Attribut | P | P | P | O | O | P1 : attributs typés/persistés ; vérité ontologique non établie. |
| Mode | P | P | P | O | O | P1 : `ontologyModes` ; portée de modélisation locale. |
| Causalité | P | P | P | O | O | P1 : service et graphe de causes ; inférence causale réelle non générale. |
| Loi | P | P | P | P | O | P1/P2 : représentation de règle, pas loi philosophique vérifiée. |
| Contrefactuel | P | P | P | O | O | P1/P2 : branches/simulations ; identité des mondes non garantie. |
| Déterminisme | P | P | P | P | O | P1 : lentille interprétative ; aucune preuve de déterminisme. |
| Temps A-series | P | P | P | O | O | P1/P3 : contrat temporel et service d'identité, pas modèle du temps complet. |
| Temps B-series | P | P | P | O | O | P1/P3 : même service, ordre relationnel borné. |
| Identité personnelle | P | P | P | P | O | P3 : critères logiciels de continuité, non identité d'une personne. |
| Continuité | P | P | P | O | O | P3 : transitions suivies, relation bornée. |
| Discontinuité | P | P | P | O | O | P3 : seuil de transition, pas rupture philosophique certifiée. |
| Transition de phase | P | P | P | O | O | P3 : détection sur données fournies, pas phénomène externe observé. |
| Monde possible | P | P | P | O | O | P3 : monde persisté, hypothèse contrefactuelle. |
| Accessibilité entre mondes | P | P | P | O | O | P3 : arêtes stockées, pas validation métaphysique. |
| Sémantique modale | P | P | P | O | O | P3 : évaluation `□`/`◇` sur modèle fini fourni. |
| Reçu de monde possible | P | P | P | O | O | P3 : reçu persisté ; atteste une opération, pas vérité du monde. |
| Dépendance causale | P | P | P | O | O | P3 : calcul de nécessité conditionnel aux entrées. |
| Réalisme spéculatif | P | P | P | O | O | P4 : service descriptif, hypothèse non promue. |
| Corrélationnisme | P | P | P | O | O | P4 : score de risque fourni/borné, pas mesure philosophique. |
| Réalisme indépendant | P | P | P | O | O | P4 : claim d'indépendance analysée, jamais établie. |
| Modèle esprit-matière | P | P | P | O | O | P1/P4 : adaptateur interprétatif, sans causalité psychophysique. |
| Propriété de deuxième ordre | P | P | P | O | O | P4 : enregistrement descriptif de propriété de propriété. |
| Tout | P | P | P | O | O | P4 : service de composition descriptif. |
| Vide | P | P | P | O | O | P4 : valeur interprétative fournie. |
| Infini | P | P | P | O | O | P4 : mode descriptif fini, pas calcul de l'infini. |
| Altérité | P | P | P | O | O | P4 : relation d'autrui typée, portée locale. |
| Autrui | P | P | P | O | O | P4 : distinction d'identifiants et relation, pas sujet réel. |
| Identité | P | P | P | O | O | P3/P4 : identité d'entités persistées, portée logicielle. |
| Continuité d’identité | P | P | P | O | O | P3 : critères calculés, non preuve d'identité personnelle. |
| Critères d’identité | P | P | P | O | O | P3 : règles explicites et révisables. |
| Métaphysique descriptive | P | P | P | O | O | P4 : enregistre descriptions/hypothèses, pas démonstration ontique. |
| Analyse interprétative | O | O | P | O | O | P1/P2 : routeur et tests de falsification ; scénario indépendant de mission absent. |
| Non-promotion d’une analyse philosophique | O | O | O | O | O | P2 : 197 lentilles sans autorité ; test de falsification PASS, garde runtime. |

### Écoles et familles philosophiques enregistrées

| École ou famille | I | V | D | U | Doc | Preuve et lacune déterminante |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Ontologie générale | P | P | P | O | O | P1 : registre et services ontologiques partiels. |
| Causalité | P | P | P | O | O | P1 : famille de concepts et service borné. |
| Temps et identité | P | P | P | O | O | P3 : service temporel, pas théorie générale. |
| Esprit et conscience | P | P | P | O | O | P1 : adaptateurs et limites de preuve de conscience. |
| Épistémologie | P | P | P | O | O | P1 : lentilles et contrats, pas théorie validée. |
| Philosophie du processus | P | P | P | O | O | P1 : service de processus borné. |
| Éthique | P | P | P | O | O | P1 : analyses, sans autorité normative automatique. |
| Phénoménologie | P | P | P | O | O | P1 : service interprétatif borné. |
| Platonisme | P | P | P | O | O | P1 : service d'école, pas validation de doctrine. |
| Aristotélisme | P | P | P | O | O | P1 : catégories/causes implémentées comme lentille. |
| Stoïcisme | P | P | P | O | O | P1 : analyse du destin et du logos, non vérité normative. |
| Épicurisme | P | P | P | O | O | P1 : atomes/vide/sensations en interprétation. |
| Scholastique | P | P | P | O | O | P1 : équivocité/analogie/univocité bornées. |
| Cartesianisme | P | P | P | O | O | P1 : dualisme en lentille. |
| Leibnizianisme | P | P | P | O | O | P1 : monades/harmonie en lentille. |
| Spinozisme | P | P | P | O | O | P1 : substance/conatus en lentille. |
| Réalisme | P | P | P | O | O | P1 : stance ontologique, non statut de vérité. |
| Nominalisme | P | P | P | O | O | P1 : stance ontologique, non statut de vérité. |
| Conceptualisme | P | P | P | O | O | P1 : stance ontologique, non statut de vérité. |
| Newtonianisme | P | P | P | O | O | P1 : service d'école, portée interprétative. |
| Kantisme | P | P | P | O | O | P1 : catégories et phénomène, analyse bornée. |
| Contingence et événement | P | P | P | O | O | P1/P3 : calcul conditionnel au modèle d'événements. |
| Matérialisme | P | P | P | O | O | P1 : monisme matériel répertorié `partial`. |
| Panpsychisme | P | P | P | O | O | P1 : hypothèse répertoriée `partial`, pas preuve de conscience. |
| Éliminativisme | P | P | P | O | O | P1 : hypothèse répertoriée `partial`. |
| Réalisme spéculatif | P | P | P | O | O | P4 : service descriptif, aucune promotion de vérité. |
| Tout, vide et infini | P | P | P | O | O | P4 : opérations descriptives bornées. |
| Altérité | P | P | P | O | O | P4 : relation calculée entre identifiants. |
| Mondes possibles | P | P | P | O | O | P3 : mondes et reçus persistés ; contrepartie réelle non vérifiée. |
| Organisme procédural | P | P | P | O | O | P1 : sous-domaine GenOS enregistré ; l'intégration organisme relève d'un autre audit. |
| Natural Creative Ecology | P | P | P | O | O | P1 : sous-domaine GenOS enregistré ; effet créatif causal non mesuré ici. |
| Adaptive Epistemic Immune System | P | P | P | O | O | P1/A1 : sous-domaine enregistré ; capacité AEIS jugée séparément en section 17. |

## Synthèse des écarts

1. Le biomimétisme spécialisé dispose de primitives locales et d'un parcours navigateur documenté, mais la capture d'un sens animal et l'intégration de toutes les primitives dans une boucle mission restent incomplètes. **GAIA n'a pas de score établi.**
2. AEIS possède une chaîne de vérification et des reçus exerçables ; plusieurs métaphores adaptatives n'ont que des mesures locales. L'indépendance dépend des descripteurs d'exécution, de la configuration des fournisseurs et de la clé de signature.
3. Les neuf familles nosologiques ont des contrats logiciels de marqueurs. Les récits de maladie et de traitement dépassent parfois ces opérateurs ; le parcours HTTP → Rust → restauration reste non validé dans N2.
4. La philosophie est utilisable comme registre, audit borné et retenue de promotion. Les 13 500 cas rejoués sont des graphes simulés, sans validation d'une théorie ni campagne sur mission réelle.
