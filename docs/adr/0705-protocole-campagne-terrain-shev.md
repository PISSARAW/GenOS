# ADR 0705 — Protocole scellé de campagne terrain SHEV

- **Statut** : Accepté pour préparer une première campagne ; campagne non exécutée
- **Date** : 2026-10-20
- **Domaine** : SHEV, développement longitudinal, expérimentation, preuve
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0650b](0650-cycle-cicatrisation-shev.md),
  [ADR 0699](0699-stewardship-depot-et-effet-projet.md),
  [protocole terrain](../06-qualite-preuves/protocole-campagne-terrain-shev.md)

## Contexte

Le noyau de campagne développementale sait valider un manifeste apparié, séparer
les fenêtres d'apprentissage des fenêtres réservées, journaliser les résultats et
produire un verdict non promoteur. Ces propriétés établissent un contrat local ;
elles ne prouvent pas un bénéfice longitudinal sur un projet réel.

Une campagne terrain exige en plus un objet expérimental immuable, deux espaces
isolés issus du même état, un calendrier préenregistré, un oracle indépendant du
producteur et une collecte complète des coûts et des échecs. Sans ces contraintes,
un résultat positif peut provenir d'une fuite de corpus, d'un changement de modèle,
d'une intervention humaine asymétrique ou d'une sélection a posteriori.

## Décision

La première campagne terrain SHEV suit un protocole apparié et scellé :

1. elle mesure uniquement la dimension
   `repository-maintenance-correctness-v1` ;
2. elle compare un bras contrôle `baseline` à un bras traitement `full_arc` ;
3. les deux bras partent du même commit et du même snapshot, mais utilisent des
   projets et workspaces distincts ;
4. elle comprend exactement cinq fenêtres d'apprentissage, suivies d'exactement
   vingt fenêtres réservées ;
5. la première et la dernière fenêtre couvrent au moins 72 heures ;
6. le modèle, les outils, les permissions, les dépendances et les budgets sont
   verrouillés symétriquement ;
7. l'oracle et le vérificateur ont des identités distinctes du producteur ;
8. tout résultat, favorable ou non, exige les preuves prévues et reste
   `promotionEligible: false` ;
9. après scellement, toute modification crée une nouvelle campagne et un nouveau
   manifeste au lieu de réécrire l'original.

Le protocole chiffré, le calendrier relatif et le canevas du manifeste sont définis
dans le [document de référence](../06-qualite-preuves/protocole-campagne-terrain-shev.md).
Le scellement est effectué au plus cinq minutes avant la première fenêtre. Les
digests du manifeste et des artefacts bruts servent d'identifiants ; un nom de
fichier ou une étiquette de modèle ne suffit pas.

Le verdict terminal peut être `field_evidence_complete` ou
`hypothesis_not_supported`. Le second est un résultat expérimental valide. Une
campagne incomplète, une preuve absente ou une dérive de verrou ne doit jamais être
transformée en succès.

## Conséquences

### Positives

- la comparaison isole l'activation de l'arc SHEV des autres conditions ;
- les tâches réservées ne peuvent pas servir à adapter le traitement ;
- les coûts, tokens, durées, régressions et interventions humaines deviennent
  opposables ;
- la reprise technique ne change ni l'échantillon ni les seuils ;
- un tiers peut reconstruire la décision depuis le manifeste et les reçus.

### Négatives

- la campagne dure plus de trois jours et immobilise deux environnements ;
- l'exigence de preuves complètes peut invalider une fenêtre techniquement réussie ;
- vingt paires offrent une puissance statistique limitée et ne fondent pas une
  généralisation à d'autres projets ou dimensions ;
- les données brutes doivent être archivées hors Git avec une politique de
  rétention explicite.

## Alternatives

### Exécuter uniquement le bras traitement

Rejeté : l'évolution du dépôt, des modèles ou de la charge ne serait pas séparée de
l'effet SHEV.

### Utiliser des tâches synthétiques accélérées comme preuve terrain

Rejeté : elles sont utiles à la répétition générale, mais ne fournissent ni durée
réelle ni validité externe.

### Ajuster les seuils après les premières fenêtres

Rejeté : cette adaptation introduirait un biais a posteriori. Une correction impose
l'abandon documenté de la campagne et un nouveau manifeste.

### Promouvoir automatiquement un résultat positif

Rejeté : le verdict de campagne soutient ou non l'hypothèse. Il n'accorde aucune
autorité d'application ou de promotion.
