# ADR 0646 - Responsabilité UX pluraliste et longitudinale

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : SHEV, expérience produit, évaluation pluraliste
- **Décideurs** : équipe GenOS
- **Lié à** : [SHEV](../02-orchestration/shev.md), [ADR 0310](0310-audits-web-shev-independants.md)

## Contexte

Un cycle ponctuel planificateur, générateur et évaluateur peut améliorer un
écran sans porter la responsabilité de sa trajectoire. Une capture, un test
navigateur ou une note esthétique ne démontre ni une dérive durable, ni un
effet pour l'utilisateur. Une moyenne peut aussi masquer le désaccord entre
publics ou donner plusieurs voix à une même identité.

SHEV possède déjà la responsabilité persistante, les autorisations signées,
les observations, les calibrations qualitatives et les effets de projet. Il
manquait un contrat qui les compose sans transformer une préférence en fait ni
donner au constat le pouvoir de déployer une modification.

## Décision

Un protocole d'expérience signé fixe avant la revue la dimension du mandat, la
grille, les publics, le nombre minimal d'évaluateurs, les seuils de calibration,
le nombre de fenêtres et la dérive visuelle maximale. Le protocole et ses
checkpoints sont immuables. Chaque checkpoint relie une période à un score de
dérive, au moins une capture et au moins un test ; ces références sont des
preuves de rendu et d'exécution, pas des mesures d'effet utilisateur.

La décision porte toujours sur le checkpoint le plus récent et exige plusieurs
fenêtres consécutives au-dessus du seuil. Le panel réutilise les calibrations
SHEV vérifiées : les identités sont dédupliquées, tous les publics préenregistrés
doivent être représentés et une majorité des deux tiers est nécessaire. Les
voix minoritaires et leur erreur de calibration restent dans le reçu.

Le résultat est borné à `REFINE`, `CHANGE_DIRECTION` ou `NO_CHANGE` :

- `NO_CHANGE` si la dérive longitudinale, le panel ou le quorum manque ;
- `REFINE` si la dérive visuelle est corroborée mais qu'aucun effet utilisateur
  indépendant ne montre une régression ;
- `CHANGE_DIRECTION` seulement si un reçu `shev_effects` de la même dimension
  conclut séparément à une régression utilisateur.

`REFINE` et `CHANGE_DIRECTION` produisent une observation de dégradation. Le
tick SHEV peut ensuite créer une tâche de diagnostic selon le mandat et les
permissions Ontogenèse. La décision ne modifie pas le produit, ne déploie rien
et ne contourne aucune gate. Le stade `observing`, une signature invalide, un
checkpoint périmé ou un mandat inactif ferment la transition.

L'analogie biomimétique est celle d'une surveillance homéorhétique : comparer
plusieurs états d'une trajectoire et déclencher une investigation bornée. Elle
ne constitue ni un jugement esthétique universel ni une preuve d'autonomie
biologique.

## Conséquences

### Positives

- La responsabilité UX survit à un cycle de génération ponctuel.
- Les captures, tests, préférences calibrées et effets utilisateur restent
  quatre catégories distinctes et traçables.
- Le désaccord est conservé au lieu d'être effacé par une moyenne.
- Une dérive corroborée rejoint l'initiative endogène SHEV sans autorité de
  modification ou de déploiement implicite.

### Négatives

- L'application doit produire plusieurs checkpoints et calibrer les évaluateurs.
- `CHANGE_DIRECTION` dépend d'un protocole métier capable de produire un vrai
  reçu d'effet utilisateur ; son absence force une conclusion plus faible.
- Les seuils détectent une dérive selon un protocole local et ne certifient pas
  la qualité esthétique d'un produit.

## Alternatives

- Relancer une critique à la demande : ne fournit ni continuité ni initiative
  fondée sur une dérive persistante.
- Utiliser un juge unique : rend invisible le désaccord entre publics.
- Déduire l'effet utilisateur des captures ou tests : confond preuve technique
  et bénéfice produit.
- Déployer automatiquement après le vote : élargit l'autorité au-delà du mandat
  et court-circuite les gates Ontogenèse.
