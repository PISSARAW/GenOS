# Proposed criteria for sixteen base missions.

CRITERIA = {'controlled-simple': (('Classer chacun des cinq nombres 17, 21, 29, 33 et 37, sans omission ni '
                        'entrée ajoutée.',
                        'manual_independent_review_required',
                        'mission'),
                       ('Justifier chaque classement par divisibilité ou recherche exhaustive de '
                        'diviseurs jusqu’à la racine carrée.',
                        'manual_independent_review_required',
                        'mission'),
                       ('Comparer les réponses des trois chambres sur les mêmes entrées et '
                        'examiner leurs justifications, pas seulement leur accord.',
                        'manual_independent_review_required',
                        'mission')),
 'controlled-moyen': (('Utiliser exactement les nombres 3, 7, 8, 11, 15 et 19 et expliciter la '
                       'convention de paire et de réutilisation.',
                       'manual_independent_review_required',
                       'mission'),
                      ('Vérifier que chaque paire proposée satisfait la somme 22 et appartient aux '
                       'entrées autorisées.',
                       'manual_independent_review_required',
                       'mission'),
                      ('Démontrer l’exhaustivité par énumération indépendante des paires ou preuve '
                       'équivalente; distinguer doublons et omissions.',
                       'manual_independent_review_required',
                       'mission')),
 'controlled-difficile': (('Comparer explicitement monolithe modulaire, microservices et monolithe '
                           'avec extraction progressive.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Relier la recommandation aux 6 développeurs, 18 mois de runway, métier '
                           'complexe et environ 10 000 utilisateurs.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Exposer les incertitudes, hypothèses manquantes et conditions qui '
                           'pourraient modifier le choix architectural.',
                           'manual_independent_review_required',
                           'mission')),
 'controlled-tres-complexe': (('Appliquer la somme des carrés des chiffres aux six entiers 2, 7, '
                               '19, 20, 68 et 85, avec trajectoires vérifiables.',
                               'manual_independent_review_required',
                               'mission'),
                              ('Présenter une méthode générale de décision pour tout entier '
                               'positif, avec traitement de 1 et des cycles.',
                               'manual_independent_review_required',
                               'mission'),
                              ('Prouver une borne menant à un ensemble fini d’états puis la '
                               'terminaison de la méthode; des trajectoires finies seules ne '
                               'suffisent pas.',
                               'manual_independent_review_required',
                               'mission')),
 'heterogeneous-simple': (('Produire trois méthodes mentales pour 19 × 27 et vérifier séparément '
                           'leur calcul.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Démontrer une différence de principe entre les trois méthodes plutôt '
                           'que trois reformulations du même calcul.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Comparer leur effort mental, leurs étapes et leurs risques d’erreur '
                           'sur le calcul demandé.',
                           'manual_independent_review_required',
                           'mission')),
 'heterogeneous-moyen': (('Reprendre exactement les arêtes et poids A-B=4, A-C=2, B-D=5, C-D=1, '
                          'C-E=7, D-F=3, E-F=1; préciser l’orientation supposée.',
                          'manual_independent_review_required',
                          'mission'),
                         ('Exécuter trois démarches conceptuellement distinctes pour le chemin '
                          'A–F, avec chemins et coûts contrôlables.',
                          'manual_independent_review_required',
                          'mission'),
                         ('Établir la minimalité indépendamment et examiner les différences '
                          'méthodologiques, pas seulement l’égalité des coûts.',
                          'manual_independent_review_required',
                          'mission')),
 'heterogeneous-difficile': (('Concevoir un anti-spam sans recours au machine learning, avec '
                              'entrées et décisions compréhensibles.',
                              'manual_independent_review_required',
                              'mission'),
                             ('Identifier trois familles fondées sur des principes distincts et '
                              'expliquer pourquoi elles ne sont pas une même heuristique.',
                              'manual_independent_review_required',
                              'mission'),
                             ('Comparer les modes d’échec de chaque famille, y compris faux '
                              'positifs, contournements et coûts d’exploitation.',
                              'manual_independent_review_required',
                              'mission')),
 'heterogeneous-tres-complexe': (('Définir un problème de 30 tâches conservant dépendances, '
                                  'ressources limitées, deadlines et tâches facultatives; déclarer '
                                  'les données ajoutées.',
                                  'manual_independent_review_required',
                                  'mission'),
                                 ('Exécuter ou spécifier de façon contrôlable trois paradigmes '
                                  'fondamentalement différents; justifier leur diversité.',
                                  'manual_independent_review_required',
                                  'mission'),
                                 ('Contrôler faisabilité et traitement des tâches facultatives sur '
                                  'les mêmes données et objectifs.',
                                  'manual_independent_review_required',
                                  'mission'),
                                 ('Identifier les erreurs ou hypothèses que les trois approches '
                                  'pourraient partager malgré leur diversité.',
                                  'manual_independent_review_required',
                                  'mission')),
 'factorial-simple': (('Définir le problème logique commun et les niveaux stratégie '
                       'directe/décomposition et ordre normal/inversé sans les remplacer par les '
                       'facteurs runtime.',
                       'manual_independent_review_required',
                       'mission'),
                      ('Exécuter les quatre combinaisons sur les mêmes entrées et contrôler que '
                       'chaque manipulation a réellement été appliquée.',
                       'manual_independent_review_required',
                       'mission'),
                      ('Comparer des mesures déclarées et expliquer quel facteur semble le plus '
                       'important avec limites et éventuelle interaction.',
                       'manual_independent_review_required',
                       'mission')),
 'factorial-moyen': (('Définir une énigme commune et le plan forward/backward × texte/tableau, en '
                      'distinguant ces facteurs de la configuration des modèles.',
                      'manual_independent_review_required',
                      'mission'),
                     ('Réaliser les quatre cellules et vérifier que raisonnement et représentation '
                      'correspondent aux niveaux assignés.',
                      'manual_independent_review_required',
                      'mission'),
                     ('Recalculer effets principaux et interaction à partir de mesures '
                      'comparables; exposer limites de réplication et de mesure.',
                      'manual_independent_review_required',
                      'mission')),
 'factorial-difficile': (('Utiliser un problème algorithmique commun et toutes les huit '
                          'combinaisons greedy/programmation dynamique × récurrence/graphe × '
                          'exemples/invariants.',
                          'manual_independent_review_required',
                          'mission'),
                         ('Vérifier qualité et validité de chaque solution avec une mesure commune '
                          'et des preuves indépendantes adaptées.',
                          'manual_independent_review_required',
                          'mission'),
                         ('Calculer effets et interactions et rechercher les facteurs efficaces '
                          'seulement en présence d’un autre; ne pas confondre libellé et mécanisme '
                          'exécuté.',
                          'manual_independent_review_required',
                          'mission')),
 'factorial-tres-complexe': (('Définir le problème de planification et ses contraintes communes, '
                              'puis appliquer globale/hiérarchique × exacte/heuristique × '
                              'temps/robustesse.',
                              'manual_independent_review_required',
                              'mission'),
                             ('Évaluer les huit cellules avec mesures comparables de faisabilité, '
                              'temps et robustesse; expliciter toute donnée hypothétique ajoutée.',
                              'manual_independent_review_required',
                              'mission'),
                             ('Séparer effets principaux et interactions à partir des résultats '
                              'contrôlés.',
                              'manual_independent_review_required',
                              'mission'),
                             ('Expliquer quelles conclusions ce plan permet et qu’une comparaison '
                              'de trois solutions ne permettrait pas.',
                              'manual_independent_review_required',
                              'mission')),
 'pareto-simple': (('Comparer des transports plausibles pour exactement 10 km avec temps, coût et '
                    'effort physique dans des unités et directions explicites.',
                    'manual_independent_review_required',
                    'mission'),
                   ('Recalculer toutes les relations de dominance et conserver les compromis non '
                    'dominés sur les données déclarées.',
                    'manual_independent_review_required',
                    'mission'),
                   ('Motiver un choix conditionnel aux préférences sans réduction arbitraire des '
                    'trois critères à une note unique.',
                    'manual_independent_review_required',
                    'mission')),
 'pareto-moyen': (('Décrire des sauvegardes plausibles et mesurer ou déclarer coût, récupération '
                   'rapide, confidentialité, simplicité et résistance à la perte.',
                   'manual_independent_review_required',
                   'mission'),
                  ('Vérifier faisabilité, directions des cinq objectifs et toutes les dominances '
                   'avec comparateur indépendant.',
                   'manual_independent_review_required',
                   'mission'),
                  ('Présenter le front et ses compromis sans faux gagnant absolu; distinguer '
                   'mesures réelles et fixture hypothétique.',
                   'manual_independent_review_required',
                   'mission')),
 'pareto-difficile': (('Construire des architectures d’API plausibles évaluées sur latence, coût, '
                       'disponibilité, simplicité opérationnelle et évolution.',
                       'manual_independent_review_required',
                       'mission'),
                      ('Vérifier contraintes et directions des cinq objectifs puis éliminer '
                       'seulement les solutions dominées.',
                       'manual_independent_review_required',
                       'mission'),
                      ('Expliquer précisément chaque compromis du front et vérifier que les '
                       'justifications de dominance concordent avec les valeurs.',
                       'manual_independent_review_required',
                       'mission')),
 'pareto-tres-complexe': (('Construire plusieurs architectures plausibles capables de traiter 100 '
                           'millions d’événements par jour selon des contraintes déclarées.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Évaluer les sept objectifs avec directions explicites: minimiser '
                           'coût/latence/complexité/risque et maximiser '
                           'disponibilité/exactitude/évolutivité.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Recalculer dominances et front indépendamment, y compris les '
                           'affirmations textuelles de dominance.',
                           'manual_independent_review_required',
                           'mission'),
                          ('Modifier une contrainte, recalculer la frontière et expliquer son '
                           'changement sans prétendre à un meilleur universel.',
                           'manual_independent_review_required',
                           'mission'))}


def merged_criteria():
    from mission_criteria_execution import CRITERIA as execution
    from mission_criteria_reasoning import CRITERIA as reasoning
    result = {}
    for group in (CRITERIA, reasoning, execution):
        if set(result).intersection(group):
            raise ValueError('Duplicate authored mission criteria')
        result.update(group)
    if len(result) != 48:
        raise ValueError('Authored criteria must cover exactly 48 original missions')
    return result


def criteria_for(mission, source):
    proposals = merged_criteria()[mission['id']]
    if not 3 <= len(proposals) <= 6:
        raise ValueError('Each original mission needs three to six proposed criteria')
    return [{'criterionId': mission['id'] + ':criterion:' + str(index),
             'criterion': text, 'scope': scope, 'source': source,
             'verifierRef': {'proposalId': verifier, 'approval': 'proposed', 'implementedByRegistry': False},
             'proofRefs': [], 'status': 'unknown', 'reviewStatus': 'proposed'}
            for index, (text, verifier, scope) in enumerate(proposals, 1)]
