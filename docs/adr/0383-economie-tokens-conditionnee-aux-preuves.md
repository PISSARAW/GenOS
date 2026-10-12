# ADR 0383 — Économie de tokens conditionnée aux preuves

- **Statut** : Accepté pour la tranche locale ; contrôleur conjoint proposé.
- **Date** : 2026-10-10.
- **Domaine** : Continuations, mémoire cognitive, routage et mesure.
- **Décideurs** : Maintenance GenOS.
- **Lié à** : [ADR 0377](0377-consolidation-scientifique-par-references-versionnees.md),
  [épistémologie](../01-concepts/epistemologie-et-evidence.md).

## Contexte

Une continuation coupait le JSON d'un rapport à 8 000 caractères. La coupe
pouvait retirer une contradiction, une source ou la fin d'une affirmation. Le
routeur entraînait son bandit avec le succès du transport fournisseur, avant
un verdict de mission indépendant. Le canary pouvait ensuite changer l'ordre
des modèles. Les reçus de tokens ne distinguaient pas toujours compteurs du
fournisseur et estimations. Ces mécanismes ne permettent pas de conclure à une
économie de tokens par résultat vérifié.

## Décision appliquée

Le contexte de continuation conserve le rapport entier. Quand plusieurs
affirmations portent les mêmes champs, une représentation tabulaire réversible
écrit ces noms une fois et conserve toutes les valeurs, notamment l'énoncé,
les références et les contradictions. Si elle n'est pas plus courte, le JSON
original est utilisé. L'empreinte SHA-256 identifie les octets du JSON source ;
elle n'atteste pas la vérité des affirmations. Aucun seuil de caractères ne
retire silencieusement une preuve.

La mémoire historique du prompt possède un budget estimatif de 2 000 tokens,
paramétrable à la baisse. Les échecs connus sont sélectionnés avant les
expériences positives. Les vésicules et le génome de prompt restent hors de ce
budget historique afin de préserver leur contrat de livraison. Quand une
mission fournit `contextTokenBudget`, le texte de mission (tâche, génome,
vésicules et mémoire) puis le prompt assemblé par le runtime GenOS sont
contrôlés par l'estimation `ceil(octets UTF-8 / 4)`. Le budget traverse le
protocole `AgentMission`. Un dépassement ou un budget invalide arrête le
démarrage avec un code d'erreur ; aucun élément de preuve n'est coupé. Sur les
chemins Codex et `caller_mcp`, les vésicules consultées ne sont consommées
qu'après le contrôle du prompt runtime. Le compteur estimé est conservé
séparément d'un éventuel comptage fournisseur mesuré. Sans budget explicite,
ce contrôle n'est pas activé. Les messages système et les résultats d'outils
ajoutés ensuite par l'hôte restent hors de ce plafond.

Le routeur journalise la provenance mesurée ou estimée des compteurs de tokens
et utilise le même estimateur pour le garde de coût que le fournisseur utilise
en repli. Il ne transforme plus une réponse du fournisseur en récompense du
bandit ou du modèle du monde. L'état du bandit change de portée afin d'écarter
les anciens exemples ainsi étiquetés. Son canary est inactif par défaut. Son
API d'observation exige un verdict explicite et une référence de preuve ; la
présence de cette référence n'en vérifie pas l'autorité. Le raccord à un gate
indépendant reste à construire avant une remise en service automatique.

Une route interrompue par délai ou annulation conserve sa réservation en état
`uncertain` si le fournisseur a pu être appelé sans reçu mesuré. Si la promesse
du fournisseur livre ensuite des compteurs explicitement mesurés, le runtime
complète le journal de cette tentative sans convertir son statut d'échec en
succès, inscrit son coût et solde la réservation. Une réponse tardive estimée
ou sans compteurs laisse la réservation incertaine. Cette réconciliation reste
liée au processus vivant : après redémarrage, une dépense sans reçu demeure
bloquante jusqu'à une procédure de réconciliation externe.

## Suite proposée

Compiler le contexte depuis les obligations ouvertes et leurs dépendances,
charger les preuves versionnées par G-CIR, puis évaluer sur des forks appariés
les choix de contexte, modèle, graphe de communication et vérification. La
promotion doit comparer les tokens de toutes les branches et contrôles par
mission validée, sans perdre les chemins de contre-preuve. Le replay actuel ne
garantit pas la répétition déterministe d'un modèle externe.

## Conséquences

- **Positives** : pas de perte silencieuse en continuation ; distinction entre
  transport, mesure et verdict ; plafond explicite pour la mémoire historique.
- **Négatives** : un rapport trop grand peut encore produire un grand prompt ;
  l'estimateur du prompt peut différer du tokenizer réel ; les prompts ajoutés
  après le démarrage et les autres runtimes ne sont pas couverts par le contrôle
  du prompt complet ; l'économie tabulaire dépend de la
  forme des affirmations ; le bandit ne
  reçoit plus de nouvelles récompenses en production avant son raccord au gate.
- **Mesure** : aucun gain net n'est revendiqué sans essais appariés et reçus de
  tokens couvrant génération, vérification, reprises et branches écartées.

## Alternatives écartées

- Tronquer le rapport ou ses sources au plafond de caractères : perte de
  preuves indétectable dans la continuation.
- Continuer d'utiliser le succès fournisseur comme verdict : confusion entre
  livraison et décision valide.
- Compresser les règles d'autorité avec la mémoire : risque de changer le gate.

## Vérification locale

`node backend/tests/test_verified_token_economy.js` contrôle la préservation
d'une contradiction au-delà de 8 000 caractères, le décodage exact, la priorité
des échecs connus et le refus des étiquettes de transport. Le banc
`test_organ_ablation_bench.js` exerce le bandit et le canary avec des verdicts
de fixture explicites ; il ne qualifie pas un gate de production.
`test_mission_prompt_context_budget.js` contrôle le refus avant lecture ou
consommation de vésicules, la transmission du budget par protobuf, le refus du
prompt runtime complet trop grand et la conservation du contexte admis.
`test_model_late_receipt.js` exerce les reçus tardifs mesurés, l'échec tardif
mesuré et la conservation d'une réservation incertaine sans mesure.
