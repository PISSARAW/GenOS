# ADR 0802 — Délégation des types de workers par contrat complet

## Contexte

Le sous-orchestrateur limitait ses enfants à `scout_cell`, `bounded_worker`,
`adaptive_worker` et `verifier_worker`. Cette liste empêchait une coordination
native de déléguer un calcul formel, une restauration, une analyse causale ou une
mission spécialisée, même lorsque la méthode, les paramètres et les leases étaient
déjà scellés. En parallèle, plusieurs chemins pouvaient planifier un type exigeant
une niche, un hôte ou une méthode native sans contrôler ces prérequis avant la
création du worker.

## Décision

Le dispatcher de sous-orchestration accepte les dix-neuf types feuilles et refuse
toujours un second `sub_orchestrator`, afin de conserver une profondeur maximale de
un. Chaque enfant passe par le même validateur d'affectation que le dispatcher racine.
Les types déterministes exigent une méthode native enregistrée ; le spécialiste
exige une niche ; le symbiote exige son contrat hôte et ses capacités ; une
restauration exige une lease concordante.

La planification libre du modèle local conserve sa grammaire restreinte aux quatre
types génériques. Elle ne peut pas inventer les paramètres ou les droits des types
spécialisés. Les dix-neuf types feuilles deviennent délégables par le chemin natif
structuré ou par un appel explicite qui fournit le contrat complet.

## Conséquences

Une affectation incomplète est refusée pendant la planification ou avant toute
persistance. Une affectation complète conserve les plafonds existants : cinq
enfants, profondeur un, 10 000 tokens délégués au maximum, délai et autorité du
parent. L'élargissement de la liste ne confère aucun droit nouveau à un enfant ;
son propre contrat, ses leases et sa barrière de preuve restent opposables.

Les tests de roster couvrent les vingt contrats structurés. La matrice native et
la campagne d'orchestration de bout en bout contrôlent ensuite le dispatch réel,
les artefacts typés, les oracles indépendants et la clôture de mission.

Les enfants imbriqués conservent le workspace de lignée de la mission racine. Leur
capsule d'exécution reste isolée dans son propre workspace, mais elle ne déplace pas
le graphe de provenance : l'enfant reprend le `workspace_id` du nœud de lignée de
son parent. Isolation physique et appartenance de provenance restent ainsi deux
notions distinctes. L'hydratation du génome n'accepte cet écart que si le workspace
de lignée appartient à la chaîne persistée des ancêtres du worker et si le workspace
courant fourni correspond encore à celui stocké pour l'agent.

Si la posture régulée abaisse le fanout après la sélection native, le runtime
recompose uniquement les étapes du pipeline en sous-lots compatibles puis recalcule
le digest du plan. Les identités, méthodes, contrats, dépendances et allocations ne
changent pas ; l'événement `NATIVE_MISSION_PLAN_REBATCHED` rend ce nouveau scellement
observable avant tout dispatch.

## Alternatives

Conserver quatre types aurait maintenu des chaînes de coopération artificiellement
plates. Fabriquer automatiquement niches, paramètres ou leases depuis du texte libre
aurait créé une autorité sans source. Autoriser un sous-orchestrateur enfant aurait
dépassé la profondeur scellée et est donc rejeté.
