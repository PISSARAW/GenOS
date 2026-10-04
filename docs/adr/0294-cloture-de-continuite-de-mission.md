# ADR 0294 — Fermeture des transitions de continuité de mission

- **Statut** : accepté
- **Date** : 2026-10-04
- **Domaine** : orchestration et survie des missions
- **Décideurs** : maintenance GenOS
- **Lié à** : [identité durable de mission](0181-identite-durable-de-mission.md)

## Contexte

Une mission pouvait hériter de descendants créés après une succession, terminer
avec un contexte de preuves périmé, rester active après un échec, ou perdre une
reprise entre la revendication du lancement et le démarrage du runtime. Une
cellule de remplacement était déclarée équivalente par sa seule présence.

## Décision

L'identité de mission est transmise au runtime initial et les membres sont
rattachés explicitement à `mission_agents`. Les lectures de preuves utilisent
ces membres et la date de création de la mission. Les statuts de mission suivent
des transitions conditionnelles ; seul le verdict final écrit `completed`.

La suspension écrit snapshot, condition, état et statut dans une transaction.
Le backend surveille les échéances temporelles persistées. Les réveils de budget,
de fournisseur et d'événement externe lisent un registre d'observations durable,
alimenté par une route réservée aux administrateurs avec référence de preuve.
La santé disponible d'un fournisseur et les événements externes expirent.
Chaque condition conserve le numéro de la dernière observation déjà présente
à son armement ou à son réarmement. Seule une observation écrite ensuite peut
déclencher un réveil lié au registre. La lecture de l'observation et la
revendication du réveil sont atomiques ; l'ordre du registre vient de la
séquence SQLite, pas des horloges des producteurs.
Les réveils par approbation relisent la décision persistée liée à l'agent.
Le réveil manuel d'une mission dormante passe par une route administrateur qui
retrouve sa condition `operator_or_signal` et son orchestrateur courant.
La succession
associe un PID au détenteur de l'autorité et renouvelle une génération après
la disparition du processus qui avait revendiqué `launching` ou `running`.
Une reprise dormante renouvelle aussi la génération quand l'ancien propriétaire
vit encore, mais attend l'arrêt du runtime enregistré avant de relancer le même
agent. La vérification de l'identité dormante et de l'arrêt de l'ancien runtime
précède la revendication du réveil. Après une interruption de réveil, le scheduler ne finalise la
reprise qu'avec une mission active, une autorité `running` et un runtime
identifié ou terminé avec succès ; les autres lancements orphelins sont arrêtés
avant réarmement. Un lancement dont le résultat reste ambigu n'est pas rejoué
automatiquement. Un administrateur peut réarmer explicitement ce cas après
avoir fourni une référence de preuve ; l'autorisation est inscrite dans l'audit.
Si la mission atteint entretemps un statut terminal, la réconciliation ferme
la condition déclenchée et aligne l'état de survie sur ce statut, sans relance.

La régénération réserve durablement chaque perte et impose un budget explicite,
un retour terminal, un rapport de contrôles fonctionnels et le rejeu indépendant
des commandes configurées par la mission pour ce rôle avant de restaurer le
rôle. La politique de commandes est immuable une fois écrite et son absence
bloque la régénération. Les échecs historiques remplacés sont exclus du verdict effectif,
tout en restant présents dans les traces et cicatrices.

## Conséquences

### Positives

Les reprises et les tentatives de réparation deviennent traçables après un
redémarrage. La gate de complétion relit le contexte le plus récent.

### Négatives

Les missions sans budget explicite ne régénèrent pas de worker. La collecte
de preuves signale désormais les erreurs SQL au lieu de les masquer.

## Alternatives

Inférer les membres depuis toute la descendance d'un orchestrateur historique
aurait admis des agents appartenant à d'autres missions. Relancer sans
nouvelle génération d'autorité aurait permis deux successeurs simultanés.

## Limites

La présence d'un PID ne constitue qu'un contrôle local de vivacité ; le
fencing par génération reste la protection contre une autorité ancienne. Les
observations de budget et fournisseur requièrent encore des producteurs métier
authentifiés ; le registre et sa route ne constituent pas une mesure autonome.
Le rejeu indépendant démontre l'exécution des commandes configurées dans le
workspace de mission. Leur pertinence fonctionnelle reste la responsabilité
de la configuration de la mission.
