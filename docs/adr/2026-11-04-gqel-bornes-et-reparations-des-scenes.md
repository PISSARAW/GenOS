# Bornes et réparations des scènes sous le contrat GQEL

- **Statut** : Implémenté et testé ; qualité rédactionnelle à qualifier sur modèle réel.
- **Dernière revue** : 2026-11-04.

## Contexte

Une demande d'une seule scène héritait du plafond global de 16 000 tokens,
sans borne de longueur du champ `sceneText`. Le Dernier Sas a ainsi consommé
ce plafond dans une négociation répétitive tronquée, légitimement refusée par
`GQEL_TRUNCATED_OUTPUT`. Rejouer son fragment ou accepter son JSON incomplet
ne constituerait pas une réparation valide.

## Décision

Chaque scène reçoit une cible indicative dérivée du minimum global de mots.
Les durées proposées sont normalisées comme poids relatifs lorsqu'elles sont
valides ; sinon la répartition est uniforme. Elles ne deviennent pas une preuve
de durée. Aucun minimum supplémentaire par scène ne remplace le minimum final.

Le plafond de sortie vaut le minimum entre le plafond contractuel et
`max(1536, cible * 6 + 256)`. Le schéma borne `sceneText` à
`max(4096, cible * 24)` points de code Unicode. La validation locale emploie la
même unité. Les consignes demandent une décision, sa conséquence et un état de
sortie concret, en conservant le plan et ses obligations provisoires.

Une boucle unique autorise au plus `1 + maxProtocolRepairs` appels par scène.
Elle partage ce plafond entre format invalide, répétition et troncature connue.
Chaque appel passe une seule fois par l'invoker canonique, qui reste le seul
comptable des tokens, appels et échéances. Le générateur natif revalide son
autorité, son annulation et l'échéance parent avant chaque nouvel appel.

La réparation d'une troncature exige le reçu exact du nouvel appel, un motif
de fin de longueur, des compteurs valides correspondant à la réponse capturée
et un budget sans exposition inconnue. Les refus de timeout, de plafond dépassé,
d'usage ou de fin non vérifiés ne deviennent jamais des réparations de scène.
La nouvelle requête demande une scène complète ; elle ne reçoit aucun fragment
tronqué. Les originaux, digests, références de route et mesures restent dans
`sceneAttempts`. `repairEligible` ne confère aucune autorité native.

## Conséquences et vérification

Une réponse complète reste un brouillon sans autorité de livraison. Les gates
sémantiques, les critères finaux, le minimum de mots, l'enveloppe exacte et les
handoffs sont inchangés. Après épuisement ou refus non réparable, l'erreur
conserve son code, ses défauts et sa cause, avec `repairable: false` : les tours
d'artefact ne peuvent pas multiplier silencieusement le budget local.

`test_gqel_scene_generation.cjs` vérifie les bornes et les caractères Unicode,
une troncature mesurée suivie d'un nouvel appel complet, les compteurs cumulés,
les identifiants distincts, les refus natifs et l'absence de reprise externe.
Ses réponses synthétiques ne constituent aucune qualification artistique.

## Alternatives

- Augmenter le plafond global : coût accru et boucle toujours possible.
- Couper le texte ou refermer son JSON : rejeté, car le modèle n'a pas livré cette réponse complète.
- Réinitialiser le budget après troncature : rejeté, car la tentative a consommé ses ressources.
- Imbriquer plusieurs boucles de réparation : rejeté, car le plafond effectif deviendrait ambigu.
