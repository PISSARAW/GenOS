# Journal des vagues de tours agentiques Rust

Quand `max_parallel_agents` est supérieur à un, une vague regroupe au plus un tour
par agent admis. La préparation des contextes, les intentions de modèle,
l’exposition du budget partagé et l’enregistrement de la vague appartiennent à
une seule transaction SQLite `IMMEDIATE`. Un membre invalide annule toute cette
préparation. Le mode de largeur un conserve son parcours séquentiel.

Le registre `protocol_agentic_parallel_waves` autorise une seule vague non clôturée
par incarnation : les états `active` et `stopped` occupent tous deux cette place.
`protocol_agentic_parallel_members` attribue chaque clé agent/tour à une vague
unique. La vérification juste avant le claim HTTP relit cette attribution,
l’intention réelle, le contexte effectif, la requête et le roster admis. Un permis
valide sans vague active correspondante ne suffit pas pour envoyer la requête.

Après les jointures des workers, le coordinateur règle leurs outils et leurs
achèvements natifs, puis demande la clôture. Le journal établit `joined` seulement
si chaque observation native possède des métriques connues et un état admissible :
soit les outils du tour ont leurs reçus réels, soit l’agent a terminé exactement à
ce tour. Un refus, une troncature, un résultat ambigu ou un outil non commis produit
un arrêt. Les consommations et expositions appartiennent au registre ALLOSTASIE et
ne sont jamais recréditées par ce journal.

Les getters relisent aussi les événements OMEGA originaux avec leur empreinte et
leur contenu exact. Recalculer les empreintes d'un descripteur ou d'un reçu modifié
ne suffit pas pour fabriquer son événement de préparation ou de clôture.

Une interruption après observation connue peut laisser un outil à reprendre.
Le coordinateur consomme les observations persistées et termine leurs seuls effets
locaux autorisés avant de préparer une autre vague. Une vague `stopped` peut alors
devenir `joined` sans appel HTTP. Le nouveau reçu référence le précédent ; les
anciens reçus restent dans `protocol_agentic_parallel_receipts`, et un événement
`AGENTIC_WAVE_RECOVERED` conserve la distinction entre arrêt et récupération.
Deux coordinateurs qui récupèrent la même vague close obtiennent le même reçu.

Une intention seule ou une issue inconnue ne recrée jamais un permis de modèle.
L’état non clôturé bloque les vagues suivantes et le transfert CONTINUITY. Une
vague entièrement observée mais pas encore clôturée bloque également EVIDENCE et
la publication. La preuve finale inclut les descripteurs, l’historique des reçus
et les empreintes des observations, outils et achèvements. Elle exige que chaque
observation du profil parallèle soit attribuée exactement à une vague clôturée.

Ce journal atteste des étapes durables et des conditions de clôture. La jointure
réelle des threads est une responsabilité du driver natif ; un champ JSON ne peut
pas prouver une jointure du système d’exploitation. La concurrence des workers
hôtes ne prouve pas une exécution simultanée dans le moteur LLM distant. Le budget
de temps reste la somme des durées mesurées, y compris lorsque des appels se
chevauchent. Les vérifications textuelles locales ne deviennent pas une preuve de
vérité sémantique ou d’indépendance statistique.
