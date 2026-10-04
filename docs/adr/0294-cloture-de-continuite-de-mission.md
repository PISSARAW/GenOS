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
Le backend surveille les échéances temporelles persistées. La succession
associe un PID au détenteur de l'autorité et renouvelle une génération après
la disparition du processus qui avait revendiqué `launching` ou `running`.

La régénération réserve durablement chaque perte et impose un budget explicite,
un retour terminal et un rapport de contrôles fonctionnels avant de restaurer
le rôle. Les échecs historiques remplacés sont exclus du verdict effectif,
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
signaux de budget, fournisseur, approbation humaine et événement externe
requièrent encore des producteurs authentifiés. Le rapport fonctionnel du
worker n'est pas une vérification indépendante.
