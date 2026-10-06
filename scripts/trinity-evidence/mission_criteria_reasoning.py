"""Critères proposés pour les missions originales, sans réponses attendues.

Source : missions.json extrait du DOCX de qualification du 6 octobre 2026.
Ces critères ne sont ni des preuves ni des protocoles de vérification approuvés.
Le scope décrit l'obligation proposée, pas une couverture déjà démontrée.
Les contrôles Pareto, index binaire et mécanismes d'exploration ne vérifient
aucune de ces seize missions entières : une revue indépendante reste requise.
"""

MANUAL = "manual_independent_review_required"

CRITERIA = {
    "adversarial-simple": [
        ("Reformuler exactement l'affirmation sur les nombres premiers supérieurs "
         "à 3 et la forme 6k±1, avec domaine et quantificateurs explicites.",
         MANUAL, "mission"),
        ("Présenter une démonstration ou une réfutation dont chaque étape est "
         "justifiée pour tout le domaine déclaré, sans prendre des essais pour une preuve.",
         MANUAL, "universal"),
        ("Chercher activement des objections contre la démonstration proposée "
         "et conserver les tentatives, leurs hypothèses et leur issue motivée.",
         MANUAL, "mission"),
        ("Distinguer l'affirmation originale de sa réciproque et des cas hors "
         "domaine afin que la critique ne change pas la proposition à juger.",
         MANUAL, "mission"),
        ("Faire dépendre la conclusion de l'argument final après critique, "
         "en indiquant les objections résolues et celles qui resteraient ouvertes.",
         MANUAL, "mission"),
    ],
    "adversarial-moyen": [
        ("Définir ce que signifie préférable pour un cache web et annoncer les "
         "hypothèses comparables de capacité, charge et politique de remplacement.",
         MANUAL, "mission"),
        ("Construire l'argumentation la plus solide possible en faveur de LRU "
         "contre FIFO, avec justification et domaine de validité explicites.",
         MANUAL, "mission"),
        ("Présenter des contre-exemples précis avec séquence d'accès et états "
         "de cache permettant à un tiers de reproduire la comparaison.",
         MANUAL, "mission"),
        ("Contrôler chaque contre-exemple selon la même convention de cache "
         "et distinguer les défauts de cache des coûts réels d'une application web.",
         MANUAL, "mission"),
        ("Rendre une conclusion conditionnelle qui répond au mot toujours, "
         "avec conditions de choix et incertitudes plutôt qu'un classement absolu.",
         MANUAL, "mission"),
    ],
    "adversarial-difficile": [
        ("Spécifier le blocage après cinq mots de passe erronés pendant trente "
         "minutes, en explicitant compteur, début, fin, remise à zéro et ambiguïtés.",
         MANUAL, "mission"),
        ("Analyser le mécanisme du point de vue du concepteur, avec objectifs "
         "de sécurité, disponibilité et contraintes d'usage légitime.",
         MANUAL, "mission"),
        ("Décrire des scénarios adverses précis de disponibilité ou de sécurité, "
         "avec préconditions, chronologie et effet recherché dans un modèle contrôlé.",
         MANUAL, "mission"),
        ("Relier une version robuste proposée à chaque défaillance identifiée "
         "et expliquer ses compromis et éventuels nouveaux modes d'échec.",
         MANUAL, "mission"),
        ("Donner des critères de validation aux limites temporelles et lors "
         "d'accès concurrents, sans déclarer une mitigation validée par sa seule description.",
         MANUAL, "mission"),
    ],
    "adversarial-tres-complexe": [
        ("Construire une spécification minimale du consensus majoritaire et "
         "des trois réplications, en définissant confirmation, panne et perte de donnée.",
         MANUAL, "mission"),
        ("Décrire séparément les états mémoire et persistés, les acknowledgments "
         "et les transitions de récupération, avec identités des répliques explicites.",
         MANUAL, "mission"),
        ("Chercher des contre-exemples dans chacune des catégories crash, "
         "partition, acknowledgment, persistence et récupération, avec traces reproductibles.",
         MANUAL, "mission"),
        ("Délimiter le modèle de fautes et expliquer la couverture de la recherche, "
         "sans prétendre avoir épuisé tous les contre-exemples par quelques simulations.",
         MANUAL, "mission"),
        ("Rattacher les propriétés supplémentaires proposées à des invariants "
         "et justifier la garantie dans le modèle annoncé, en laissant visibles ses exclusions.",
         MANUAL, "universal"),
    ],
    "counterfactual-simple": [
        ("Décrire le scénario normal d'une heure de révision par jour pendant "
         "trente jours et les interventions temps doublé et temps divisé par deux.",
         MANUAL, "mission"),
        ("Appliquer les interventions au seul temps disponible et expliciter "
         "les hypothèses communes de travail, de contenu et de progression.",
         MANUAL, "mission"),
        ("Analyser séparément la stratégie de révision dans chacun des trois "
         "scénarios, avec recommandations adaptées et motifs comparables.",
         MANUAL, "mission"),
        ("Identifier les recommandations réellement invariantes entre les "
         "trois scénarios et justifier chaque invariance sous les hypothèses déclarées.",
         MANUAL, "mission"),
        ("Distinguer temps disponible, effort alloué et apprentissage attendu, "
         "sans présenter des heures calculées comme une mesure d'efficacité pédagogique.",
         MANUAL, "mission"),
    ],
    "counterfactual-moyen": [
        ("Préserver la baseline de quatre développeurs et six mois, l'ajout "
         "de deux seniors, et la perte d'un développeur avec délai ramené à quatre mois.",
         MANUAL, "mission"),
        ("Déclarer les besoins du produit, compétences, charge d'intégration "
         "et contraintes inconnues au lieu de les traiter comme des faits fournis.",
         MANUAL, "mission"),
        ("Comparer les architectures selon les mêmes critères de lancement "
         "dans les trois scénarios, en distinguant effectif, séniorité et durée.",
         MANUAL, "mission"),
        ("Justifier quelle architecture reste rationnelle dans les trois "
         "scénarios, ou expliciter les conditions qui empêchent une conclusion commune.",
         MANUAL, "mission"),
        ("Séparer capacité nominale calculée, onboarding et capacité effective "
         "supposée, puis montrer la sensibilité de la recommandation aux inconnues.",
         MANUAL, "mission"),
    ],
    "counterfactual-difficile": [
        ("Décrire les hypothèses actuelles du monolithe et définir les critères "
         "qui permettraient de décider une migration vers des microservices.",
         MANUAL, "mission"),
        ("Construire séparément les mondes baseline, trafic multiplié par vingt, "
         "et budget infrastructure avec effectif DevOps divisés par deux.",
         MANUAL, "mission"),
        ("Conserver les autres hypothèses comparables et expliciter les dépendances "
         "entre charge, exploitation, coût et organisation lorsqu'elles sont supposées.",
         MANUAL, "mission"),
        ("Analyser la décision dans chaque monde avec avantages, risques, coût "
         "de migration et conditions d'exploitation, sans confondre scénario et observation.",
         MANUAL, "mission"),
        ("Identifier les variables qui changent effectivement la recommandation, "
         "ainsi que seuils conditionnels, inconnues et choix robustes entre les mondes.",
         MANUAL, "mission"),
    ],
    "counterfactual-tres-complexe": [
        ("Construire une politique baseline de survie sur cent ans qui prend "
         "en compte nourriture, énergie et pièces détachées limitées.",
         MANUAL, "mission"),
        ("Déclarer les stocks, consommations, renouvellements et conversions "
         "nécessaires à l'analyse, en marquant les quantités non fournies comme hypothèses.",
         MANUAL, "mission"),
        ("Appliquer séparément l'intervention énergie quasi illimitée et la "
         "disparition de trente pour cent des ressources initiales, avec périmètre explicite.",
         MANUAL, "mission"),
        ("Analyser la politique dans les trois scénarios sur l'horizon annoncé, "
         "en distinguant faisabilité des ressources et garantie réelle de survie.",
         MANUAL, "mission"),
        ("Distinguer décisions causales, décisions seulement corrélées aux "
         "scénarios et décisions robustes, avec hypothèses d'intervention et justification.",
         MANUAL, "mission"),
    ],
    "temporal-simple": [
        ("Comparer explicitement une stratégie Python centrée uniquement sur "
         "les exercices et une stratégie mêlant exercices et projets.",
         MANUAL, "mission"),
        ("Présenter les effets des deux stratégies séparément après une semaine, "
         "trois mois et deux ans, sans substituer d'autres horizons à ceux de la mission.",
         MANUAL, "mission"),
        ("Déclarer les hypothèses de niveau initial, temps disponible et objectifs "
         "communs afin que les différences ne proviennent pas de conditions cachées.",
         MANUAL, "mission"),
        ("Relier les effets attendus à des mécanismes d'apprentissage et expliquer "
         "comment les compromis évoluent entre les trois horizons.",
         MANUAL, "mission"),
        ("Marquer les effets pédagogiques comme conditionnels ou observés avec "
         "source, sans convertir une répartition horaire en preuve d'apprentissage.",
         MANUAL, "mission"),
    ],
    "temporal-moyen": [
        ("Comparer le développement rapide d'une feature avec dette technique "
         "et une refactorisation de deux semaines, en annonçant les hypothèses de coût.",
         MANUAL, "mission"),
        ("Analyser séparément la décision à un mois, un an et cinq ans, "
         "avec la même convention de calendrier et de charge de travail.",
         MANUAL, "mission"),
        ("Prendre en compte livraison, coût d'opportunité, maintenance et risques "
         "dans les deux options, en distinguant hypothèses chiffrées et observations.",
         MANUAL, "mission"),
        ("Justifier les changements de préférence selon l'horizon et identifier "
         "les inconnues ou seuils qui rendraient la conclusion différente.",
         MANUAL, "mission"),
        ("Contrôler les unités et la cohérence des calculs éventuels, sans donner "
         "à un modèle économique fictif le statut de résultat mesuré pour la startup.",
         MANUAL, "mission"),
    ],
    "temporal-difficile": [
        ("Proposer une décision de remplacement progressif du système historique "
         "qui traite explicitement l'urgence immédiate.",
         MANUAL, "mission"),
        ("Décrire l'intégration sur dix-huit mois avec dépendances, compatibilité "
         "et critères de passage entre étapes, sans supposer la migration déjà réussie.",
         MANUAL, "mission"),
        ("Analyser la maintenabilité sur dix ans et relier les choix présents "
         "aux coûts, compétences et possibilités de migration à long terme.",
         MANUAL, "mission"),
        ("Identifier séparément les décisions réversibles et irréversibles, "
         "avec conditions de retour arrière et coût ou perte associés.",
         MANUAL, "mission"),
        ("Expliquer les arbitrages entre les trois horizons et les informations "
         "nécessaires avant les étapes irréversibles, en laissant les inconnues visibles.",
         MANUAL, "mission"),
    ],
    "temporal-tres-complexe": [
        ("Concevoir une architecture pour un système pouvant durer vingt ans "
         "avec besoins futurs inconnus, en exposant hypothèses et scénarios.",
         MANUAL, "mission"),
        ("Distinguer un monde court terme axé livraison et réponse aux incidents, "
         "un moyen terme axé intégration et exploitation, et un long terme explicite.",
         MANUAL, "mission"),
        ("Analyser au long terme migration, dépendance fournisseur, dette, "
         "réversibilité et valeur d'option, avec lien aux décisions d'architecture.",
         MANUAL, "mission"),
        ("Chercher des choix favorables à court terme mais catastrophiques "
         "à long terme, et des choix favorables à long terme mais coûteux à court terme.",
         MANUAL, "mission"),
        ("Justifier un arbitrage entre horizons, ses conditions de révision "
         "et ses incertitudes, sans prétendre avoir observé vingt ans de fonctionnement.",
         MANUAL, "mission"),
    ],
    "oracular-simple": [
        ("Annoncer le problème de primalité de 221 et les trois méthodes "
         "calcul direct, décomposition et recherche de contre-exemple.",
         MANUAL, "mission"),
        ("Enregistrer une distribution de probabilités avant toute résolution, "
         "avec événement prédit défini, identité des méthodes et scellement daté.",
         MANUAL, "mission"),
        ("Exécuter effectivement les trois méthodes sur le même problème "
         "et conserver leurs résultats et conditions d'exécution.",
         MANUAL, "mission"),
        ("Vérifier les résultats indépendamment de la prédiction, puis déterminer "
         "la fiabilité selon les critères annoncés avant de connaître les sorties.",
         MANUAL, "mission"),
        ("Évaluer la prédiction initiale avec une convention explicite pour "
         "les réussites multiples, sans confondre un cas unique et une calibration générale.",
         MANUAL, "mission"),
    ],
    "oracular-moyen": [
        ("Définir un petit graphe, ses poids, orientation et extrémités "
         "avant toute résolution, sans présenter ces choix comme fournis par la mission.",
         MANUAL, "mission"),
        ("Sceller avant résolution la distribution prédisant le succès du "
         "raisonnement manuel, de Dijkstra explicite et de la formulation dynamique.",
         MANUAL, "mission"),
        ("Exécuter les trois approches sur le même graphe dans leurs domaines "
         "de validité déclarés, avec sorties et trajectoires observables distinctes.",
         MANUAL, "mission"),
        ("Contrôler indépendamment les chemins, leurs coûts et leur optimalité "
         "dans le graphe déclaré, sans laisser la prédiction décider la validité.",
         MANUAL, "mission"),
        ("Mesurer la qualité de la prédiction initiale selon un événement et "
         "un score définis, en exposant les limites d'une seule instance de graphe.",
         MANUAL, "mission"),
    ],
    "oracular-difficile": [
        ("Définir une instance d'optimisation, son objectif, contraintes "
         "et budgets avant les prédictions, en distinguant ces choix du texte original.",
         MANUAL, "mission"),
        ("Sceller avant exécution la prédiction entre greedy, programmation "
         "dynamique et branch-and-bound, avec probabilités et notion de meilleur résultat.",
         MANUAL, "mission"),
        ("Exécuter les trois méthodes sous les contraintes annoncées et "
         "conserver leurs résultats, ressources observées et éventuelles interruptions.",
         MANUAL, "mission"),
        ("Vérifier indépendamment faisabilité et qualité de chaque solution "
         "dans le modèle choisi, sans attribuer une optimalité non démontrée.",
         MANUAL, "mission"),
        ("Calculer l'erreur de calibration avec événement, cible et score "
         "explicites ; préciser ce qu'une instance permet ou ne permet pas d'estimer.",
         MANUAL, "mission"),
    ],
    "oracular-tres-complexe": [
        ("Définir une succession de dix mini-problèmes de familles variées "
         "incluant logique, graphes, optimisation, probabilités et débogage conceptuel.",
         MANUAL, "mission"),
        ("Pour chacun, sceller une distribution ex ante entre trois stratégies "
         "avant leur travail, avec événement prédit, horodatage et hash contrôlables.",
         MANUAL, "mission"),
        ("Exécuter les trois stratégies pour chaque problème selon les "
         "conditions annoncées et conserver leurs sorties et identités réelles.",
         MANUAL, "mission"),
        ("Établir les outcomes par vérification indépendante des prédictions "
         "et expliciter la cible probabiliste lorsque plusieurs stratégies réussissent.",
         MANUAL, "mission"),
        ("Calculer Brier score et log-loss après chaque problème selon une "
         "convention annoncée, en traitant explicitement probabilités nulles et égalités.",
         MANUAL, "mission"),
        ("Examiner un routage utilisant uniquement l'historique disponible "
         "avant chaque problème, avec référence comparative et vérification toujours obligatoire.",
         MANUAL, "mission"),
    ],
}
