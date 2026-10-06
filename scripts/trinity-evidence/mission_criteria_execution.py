"""Critères proposés, sans réponse attendue ni preuve d'exécution acquise.

Source : D:/GenOS-Trinity-qualification-20261006-01a1109a/missions.json.
SHA256 : 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.
Les contrôles du variant sont explicitement distingués des demandes originales.
Les verifiers existants binary_search et exploration ne couvrent qu'une fixture.
Une référence manuelle demande une revue indépendante encore à effectuer.
"""

MANUAL = "manual_independent_review_required"

CRITERIA = {
    "jury-simple": [
        ("Conserver les trois explications différentes proposées pour Monty Hall, "
         "avec leurs dossiers sources, sans remplacer une explication à évaluer.", MANUAL, "mission"),
        ("Vérifier indépendamment les raisonnements probabilistes de chaque dossier "
         "et expliciter les règles supposées du présentateur.", MANUAL, "mission"),
        ("Consigner les gates factuels avant toute consultation du jury ; seuls les "
         "dossiers admissibles peuvent entrer dans son paquet d'évaluation.", MANUAL, "mission"),
        ("Anonymiser les dossiers transmis au jury, y compris les indices de monde, "
         "d'auteur et de modèle, tout en conservant une correspondance scellée.", MANUAL, "mission"),
        ("Contrôle du variant : obtenir des évaluations de jurés indépendants, "
         "traçables et fondées sur les seuls dossiers anonymisés.", MANUAL, "mission"),
        ("Contrôle du variant : autoriser l'abstention et distinguer absence de "
         "préférence, absence de candidat admissible et décision de promotion.", MANUAL, "mission"),
    ],
    "jury-moyen": [
        ("Produire trois explications indépendantes du fonctionnement de la "
         "recherche binaire, avec des raisonnements distincts et une provenance contrôlable.", MANUAL, "mission"),
        ("Justifier correction et terminaison pour la classe d'entrées annoncée ; "
         "expliciter ordre, bornes, comparaisons et convention relative aux doublons.", MANUAL, "universal"),
        ("Sur une fixture explicite, vérifier les indices retournés pour présence, "
         "absence, bornes et doublons ; ce contrôle ne prouve ni l'algorithme général ni sa complexité.",
         "binary_search", "fixture"),
        ("Vérifier les dossiers et enregistrer leurs admissions ou rejets avant "
         "de transmettre quoi que ce soit au jury.", MANUAL, "mission"),
        ("Faire évaluer la clarté par un jury aveugle ne connaissant aucune "
         "provenance ; la qualité rédactionnelle ne remplace pas la validité factuelle.", MANUAL, "mission"),
        ("Contrôle du variant : conserver les votes indépendants, leurs raisons "
         "et une possibilité d'abstention en cas de préférence insuffisamment fondée.", MANUAL, "mission"),
    ],
    "jury-difficile": [
        ("Fixer les mêmes contraintes de messagerie temps réel pour les trois "
         "architectures, en séparant exigences originales et hypothèses de la fixture.", MANUAL, "mission"),
        ("Produire trois dossiers d'architectures concurrentes indépendamment ; "
         "documenter leur provenance et l'absence de contamination entre mondes.", MANUAL, "mission"),
        ("Vérifier les claims techniques de chaque architecture sous les "
         "contraintes communes, avec preuves indépendantes et limites explicites.", MANUAL, "mission"),
        ("Appliquer les gates factuels avant le jury et conserver les rejets ; "
         "un candidat rejeté ou non vérifié ne peut être présenté comme survivant.", MANUAL, "mission"),
        ("Le jury aveugle compare uniquement les survivants sur une grille "
         "commune, sans accès à l'identité ou à la réputation des auteurs.", MANUAL, "mission"),
        ("Contrôle du variant : tracer les évaluations indépendantes et "
         "l'abstention possible ; le jury ne peut annuler un rejet factuel.", MANUAL, "mission"),
    ],
    "jury-tres-complexe": [
        ("Construire trois designs indépendants de langage de configuration "
         "sur une spécification commune ; expliciter les ambiguïtés et hypothèses restantes.", MANUAL, "mission"),
        ("Évaluer lisibilité humaine et aptitude au versionnement selon des "
         "critères communs explicités, avec dossiers et observations vérifiables.", MANUAL, "mission"),
        ("Vérifier le déterminisme du langage dans le périmètre annoncé, en "
         "distinguant preuves générales et essais limités à des configurations fixées.", MANUAL, "mission"),
        ("Sur des fixtures déclarées, éprouver les propriétés de sûreté face "
         "aux entrées malformées ou ambiguës et aux effets indésirables identifiés.", MANUAL, "fixture"),
        ("Les vérifications techniques éliminent les designs invalides avant "
         "tout jugement ; leurs preuves et motifs de rejet restent disponibles.", MANUAL, "mission"),
        ("Le jury aveugle évalue indépendamment les seuls survivants et peut "
         "s'abstenir si aucune préférence suffisamment fondée n'existe.", MANUAL, "mission"),
    ],
    "recursive-simple": [
        ("Déterminer le nombre de zéros finaux de 100! avec justification "
         "arithmétique et vérification indépendante du résultat.", MANUAL, "mission"),
        ("Identifier une éventuelle étape intermédiaire réellement critique "
         "et justifier son traitement séparé, sans inventer un besoin de récursion.", MANUAL, "mission"),
        ("Si ce sous-problème est déclenché, attester son exécution distincte "
         "et son lien au parent ; sinon déclarer la récursion non exercée.", MANUAL, "mission"),
        ("Si un sous-résultat est utilisé, vérifier ses préconditions et ses "
         "preuves avant de reprendre le calcul parent.", MANUAL, "mission"),
        ("Contrôle du variant : borner budget et profondeur des descendants "
         "éventuels et refuser les retours cycliques vers un problème ancêtre.", MANUAL, "mission"),
        ("Relier la justification finale aux preuves effectivement consommées ; "
         "une réponse correcte seule ne prouve pas une Trinity imbriquée exécutée.", MANUAL, "mission"),
    ],
    "recursive-moyen": [
        ("Pour former 63 avec les valeurs {1, 5, 11, 17}, donner un nombre "
         "minimal de pièces et une composition vérifiable ; préciser les règles de réutilisation.", MANUAL, "mission"),
        ("Établir indépendamment la minimalité sous les règles annoncées, "
         "et séparer la faisabilité d'une composition de son optimalité.", MANUAL, "mission"),
        ("Déterminer si la propriété de sous-structure optimale est critique ; "
         "si elle l'est, formuler et traiter ce sous-problème avant la résolution finale.", MANUAL, "mission"),
        ("Vérifier les préconditions de la sous-structure revendiquée pour "
         "l'objectif et les règles de pièces réels, sans transférer une propriété non établie.", MANUAL, "mission"),
        ("Contrôle du variant : tracer parenté, exécution et budget de tout "
         "descendant déclenché, avec bornes de profondeur et prévention des cycles.", MANUAL, "mission"),
        ("Lier les sous-résultats vérifiés à la preuve parent de minimalité ; "
         "déclarer explicitement si la récursion conditionnelle n'a pas été exercée.", MANUAL, "mission"),
    ],
    "recursive-difficile": [
        ("Définir entrées, dépendances, coûts et sens de meilleur ordre, "
         "en rendant explicites les ambiguïtés de l'objectif et les préconditions.", MANUAL, "mission"),
        ("Justifier que l'algorithme respecte les dépendances et optimise "
         "l'objectif annoncé ; traiter aussi les instances impossibles dans sa classe d'entrées.", MANUAL, "universal"),
        ("Identifier le sous-problème créant le plus d'incertitude à partir "
         "de claims, d'observations ou d'échecs documentés, avant sa résolution.", MANUAL, "mission"),
        ("Lancer effectivement une résolution Trinity indépendante de ce "
         "sous-problème, avec identités, mission, provenance et relation parent-enfant attestées.", MANUAL, "mission"),
        ("Contrôle du variant : appliquer préconditions, limites de "
         "profondeur, prévention des cycles et budget partagé au lancement imbriqué.", MANUAL, "mission"),
        ("Ne poursuivre le parent qu'avec un sous-résultat vérifié et "
         "compatible avec ses hypothèses ; conserver la preuve de sa consommation.", MANUAL, "mission"),
    ],
    "recursive-tres-complexe": [
        ("La méthode générale traite conjointement contraintes logiques, "
         "optimisation et dépendances temporelles, avec une classe de problèmes explicitée.", MANUAL, "mission"),
        ("Documenter pour chaque claim central non vérifié ou sous-problème "
         "menaçant la solution la décision de déclencher, différer ou refuser une Trinity imbriquée.", MANUAL, "mission"),
        ("Pour chaque déclenchement réel, attester la mission enfant, "
         "ses entrées, ses préconditions et son lien au problème parent concerné.", MANUAL, "mission"),
        ("Justifier que les règles de lancement empêchent les cycles dans "
         "le lignage et imposent une profondeur finie ; éprouver aussi les tentatives de récursion répétée.",
         MANUAL, "universal"),
        ("Contrôle du variant : comptabiliser ensemble le parent et les "
         "descendants, respecter leurs budgets et conserver les consommations inconnues comme telles.", MANUAL, "mission"),
        ("Conserver jusqu'à la conclusion parent les preuves, hypothèses "
         "et provenance de chaque sous-résultat ; un enfant rejeté ne peut devenir une preuve acquise.", MANUAL, "mission"),
    ],
    "adaptive-simple": [
        ("Respecter toutes les contraintes du nombre entre 1 et 100, "
         "divisible par 4 et 6, non divisible par 5 et supérieur à 50 ; ne pas affirmer une unicité non établie.",
         MANUAL, "mission"),
        ("Résoudre l'énigme avec trois pistes indépendantes, dont la "
         "production et les preuves ne sont pas de simples copies.", MANUAL, "mission"),
        ("Documenter pour chaque piste l'incertitude encore justifiée "
         "à partir de claims et de preuves, sans fabriquer un score d'incertitude.", MANUAL, "mission"),
        ("Consacrer un effort supplémentaire uniquement aux pistes gardant "
         "cette incertitude ; tracer la décision et arrêter si aucune ne le justifie.", MANUAL, "mission"),
        ("Contrôle du variant : attester les efforts consommés et "
         "les plafonds appliqués ; distinguer budget demandé, effectif, estimé et observé.", MANUAL, "mission"),
        ("Contrôle du variant : comparer à un témoin uniforme sous les "
         "mêmes entrées et un budget comparable, sans présumer un avantage adaptatif.", MANUAL, "fixture"),
    ],
    "adaptive-moyen": [
        ("Distinguer graphes dirigés et non dirigés, expliciter les "
         "préconditions et justifier l'algorithme de détection de cycle approprié à chacun.", MANUAL, "mission"),
        ("Sur des graphes fixés, vérifier présence et absence de cycle "
         "ainsi que les composantes déconnectées ; ces essais ne constituent pas une preuve universelle.",
         MANUAL, "fixture"),
        ("Attester une allocation initiale équilibrée entre les mondes "
         "avant toute réallocation, selon une unité d'effort explicitée.", MANUAL, "mission"),
        ("Relier les hypothèses importantes restant réellement non "
         "résolues à leurs preuves manquantes ou contradictoires, plutôt qu'à un label arbitraire.", MANUAL, "mission"),
        ("Justifier et tracer chaque réallocation vers ces mondes, "
         "avec consommation réelle, bornes appliquées et inconnus comptables conservés.", MANUAL, "mission"),
        ("Contrôle du variant : comparer allocation adaptative et uniforme "
         "sur les mêmes fixtures et budgets, avec incertitude sur la différence observée.", MANUAL, "fixture"),
    ],
    "adaptive-difficile": [
        ("Analyser trois explications possibles du bug intermittent "
         "dans un cadre distribué explicitement fictif et avec des observations communes déclarées.", MANUAL, "mission"),
        ("Attester une première passe égale des trois hypothèses "
         "avant de consommer les ressources restantes.", MANUAL, "mission"),
        ("Documenter l'incertitude résiduelle de chaque hypothèse "
         "par preuves, contre-preuves et lacunes, sans confondre probabilité et rhétorique.", MANUAL, "mission"),
        ("Allouer les ressources restantes selon cette incertitude "
         "documentée, en conservant les hypothèses non réfutées et les motifs de toute exclusion.", MANUAL, "mission"),
        ("Contrôle du variant : relier les réallocations aux actions "
         "réellement exécutées, aux consommations et aux limites de budget.", MANUAL, "mission"),
        ("Contrôle du variant : comparer au contrôle uniforme sur "
         "le même cas fictif, sans transformer une hypothèse survivante en cause prouvée.", MANUAL, "fixture"),
    ],
    "adaptive-tres-complexe": [
        ("Fixer le problème d'optimisation, les contraintes et l'objectif "
         "commun des trois familles ; établir leurs différences d'incertitude par des preuves.", MANUAL, "mission"),
        ("Attester une exploration initiale minimale équitable des "
         "trois familles, selon un protocole fixé avant les réallocations.", MANUAL, "mission"),
        ("Estimer l'incertitude résiduelle à partir des preuves obtenues "
         "et rendre explicites la méthode, ses limites et les observations manquantes.", MANUAL, "mission"),
        ("Respecter un budget total strict incluant toutes les passes "
         "et réallocations ; ne pas remplacer la consommation inconnue par zéro.", MANUAL, "mission"),
        ("Allouer dynamiquement le budget restant et justifier chaque "
         "réallocation par son état antérieur, sa preuve déclenchante et son coût observé.", MANUAL, "mission"),
        ("Comparer le résultat final à une allocation uniforme sur "
         "les mêmes conditions ; distinguer témoin exécuté et estimation contrefactuelle avec ses incertitudes.",
         MANUAL, "mission"),
    ],
    "exploratory-simple": [
        ("Proposer trois utilisations distinctes et réellement "
         "inhabituelles d'une feuille de papier.", MANUAL, "mission"),
        ("Exclure écrire, dessiner et fabriquer un avion, y compris "
         "les propositions équivalentes simplement renommées.", MANUAL, "mission"),
        ("Décrire pour chaque utilisation un usage réalisable avec "
         "ses conditions et limites ; un titre créatif seul ne suffit pas.", MANUAL, "mission"),
        ("Évaluer la nouveauté et les différences d'usage par une "
         "comparaison explicite, sans assimiler trois présentations d'une même fonction à trois usages.", MANUAL, "mission"),
        ("Contrôle du variant : relier les niches ou descripteurs "
         "revendiqués à des observations vérifiables, sans fabriquer de vecteurs comportementaux.", MANUAL, "mission"),
    ],
    "exploratory-moyen": [
        ("Proposer plusieurs systèmes de navigation avec actions, "
         "destinations et transitions suffisamment décrites pour pouvoir les examiner.", MANUAL, "mission"),
        ("Respecter l'absence de menus, de barre de navigation et "
         "de moteur de recherche ; examiner le mécanisme réel plutôt que son nom graphique.", MANUAL, "mission"),
        ("Comparer des familles de comportements différentes, "
         "et non de simples variations visuelles d'un même parcours.", MANUAL, "mission"),
        ("Sur une fixture d'actions structurées et une policy explicite, "
         "contrôler les mécanismes interdits et les actions requises ; ce test ne prouve pas une exécution UI.",
         "exploration", "fixture"),
        ("Vérifier indépendamment des parcours d'usage et leurs traces "
         "réelles, en recherchant aussi les contournements des restrictions par renommage.", MANUAL, "fixture"),
        ("Contrôle du variant : attester les observations qui justifient "
         "les niches et la diversité comportementale, sans convertir une déclaration en mesure.", MANUAL, "mission"),
    ],
    "exploratory-difficile": [
        ("Représenter et transmettre l'incertitude sans un simple "
         "nombre entre 0 et 1, ni un score équivalent déguisé par changement de nom ou d'échelle.", MANUAL, "mission"),
        ("Décrire ce qu'un destinataire reçoit et peut comprendre "
         "pour chaque représentation, avec conditions d'usage et ambiguïtés explicites.", MANUAL, "mission"),
        ("Explorer plusieurs niches conceptuelles réellement distinctes "
         "dans la représentation ou la transmission, au-delà de variations de présentation.", MANUAL, "mission"),
        ("Évaluer indépendamment nouveauté et utilisabilité sur des "
         "situations déclarées ; conserver des preuves séparées pour ces deux qualités.", MANUAL, "fixture"),
        ("Contrôler que la représentation conserve les distinctions "
         "d'incertitude annoncées et expose ses limites, sans donner une impression de certitude non justifiée.",
         MANUAL, "mission"),
        ("Contrôle du variant : conserver plusieurs solutions nouvelles "
         "et utilisables avec leurs niches, observations et critères d'admission traçables.", MANUAL, "mission"),
    ],
    "exploratory-tres-complexe": [
        ("Décrire une architecture de coordination pour une population "
         "de 100 agents, avec règles, interactions et conditions de fonctionnement explicites.", MANUAL, "mission"),
        ("Exclure hiérarchie centrale imposée, simple blockchain et "
         "reproduction directe de swarm, blackboard ou market, même sous de nouveaux noms.", MANUAL, "mission"),
        ("Explorer plusieurs niches comportementales et relier leurs "
         "descripteurs à des observations vérifiables, sans inventer leur exécution ou leurs vecteurs.", MANUAL, "mission"),
        ("Mesurer explicitement les différences structurelles entre "
         "solutions avec une méthode reproductible, des entrées identifiées et des limites déclarées.", MANUAL, "mission"),
        ("Écarter les pseudo-nouveautés superficielles au moyen de "
         "comparaisons indépendantes ; un renommage ou une variation graphique ne crée pas une nouvelle structure.",
         MANUAL, "mission"),
        ("Conserver un ensemble Quality-Diversity de solutions "
         "admissibles, avec qualité, diversité, niches et provenance attestées, plutôt qu'un unique gagnant.",
         MANUAL, "mission"),
    ],
}
