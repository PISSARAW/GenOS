# ADR 0520 — Produire la preuve indépendante avant la completion Ontogenesis

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Ontogenesis, preuves d'exécution, promotion
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0235 — Configuration versionnée des projets Ontogenesis

## Contexte

Le collecteur de preuves de mission maintient `verifierReceiptPresent` à `false`,
car il ne reçoit aucune preuve de vérification indépendante. Pourtant, le gate de
completion refuse toute mission qui exige une preuve avant promotion. Ontogenesis
exécute déjà les commandes de contrôle lors de l'intégration, après ce gate : le
producteur existe, mais son ordre d'exécution rend la completion inaccessible.

Les rapports et événements des workers ne peuvent pas combler ce manque : ils sont
des déclarations du producteur de la mission. La preuve doit venir de l'exécuteur
Ontogenesis, porter sur les commandes configurées et rester liée au contenu exact
du workspace candidat.

## Décision

Après la fin des workers et avant le gate de completion, le runner exécute les
contrôles structurés configurés par l'opérateur sur le workspace candidat. Il
construit un reçu interne contenant l'identité de mission, le chemin canonique du
workspace, l'empreinte de son arbre de fichiers, l'empreinte des contrôles et les
preuves de commandes produites par `proofService`.

Le gate revalide la source, la mission, le workspace, la liste exacte des contrôles,
les preuves et l'empreinte actuelle de l'arbre. Toute modification du workspace,
tout contrôle manquant ou toute preuve incohérente laisse le drapeau absent. Les
événements et rapports des agents n'influencent pas ce drapeau. La vérification
ultérieure avant intégration est conservée pour couvrir les changements de contenu
et l'autorité de promotion.

## Conséquences

### Positives

- Les missions Ontogenesis peuvent atteindre completion avec une preuve réellement
  exécutée par le runner, sans faire confiance à l'auto-déclaration des workers.
- La preuve est invalidée si le workspace, l'identité de mission ou les contrôles
  configurés changent.

### Négatives

- Les contrôles configurés sont exécutés une première fois avant completion puis
  de nouveau avant l'intégration ; cela consomme du temps et des ressources.
- Une configuration sans autorisation d'exécution ou sans contrôle échoue en mode
  fermé et ne satisfait pas le contrat de preuve.

## Alternatives

- Faire confiance aux reçus annoncés par les workers ou à la télémétrie : rejeté,
  car la mission pourrait certifier son propre résultat.
- Retirer le gate de preuve : rejeté, car cela contournerait le contrat de promotion.
- Déplacer le gate après l'intégration : rejeté, car la completion autoriserait alors
  la promotion avant la vérification indépendante.
