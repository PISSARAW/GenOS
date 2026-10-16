# ADR 0564 — Charger les issues vérifiées dans la continuation morphogénétique

- **Statut** : Accepté pour le chargement durable ; production comparative à qualifier
- **Date** : 2026-10-16
- **Lié à** : ADR 0554, 0563

## Contexte

Le calibrateur de l'ADR 0554 exige des issues appariées, un reçu indépendant
valide et une séparation entre entraînement et validation. La continuation
acceptait un adaptateur `loadVerifiedOutcomes`, mais le chemin standard ne le
fournissait pas. Même des issues admissibles ne pouvaient donc pas influencer
la politique d'une mission après leur enregistrement.

## Décision

Un registre SQLite append-only conserve les issues de calibration complètes,
leur empreinte et leur périmètre mission, organisation et projet. L'écriture
refuse une issue sans reçu indépendant vérifié. La même identité rejouée avec
le même contenu est idempotente ; une autre charge ou un autre périmètre sous
cette identité est un conflit. Les triggers interdisent modification et
suppression. La lecture vérifie à nouveau l'empreinte et le reçu. Elle borne
désormais le résultat à 8192 issues, avec un quota par candidat et séparation
entraînement/validation (ADR 0566).

Le chemin standard de `agentRoundService` fournit ce lecteur à
`planContinuation`. Les missions d'un même projet peuvent partager un corpus
de calibration ; sans organisation et projet, la lecture est limitée à la
mission exacte. Le calibrateur conserve ses exigences de 30 entraînements,
10 validations, familles et modèles disjoints, et erreur tenue à l'écart
meilleure que le prior. Un échantillon insuffisant laisse `NO_CHANGE` gagner.

Le chargement ne transforme pas le score documentaire d'un variant en gain
observé. Le `candidateId` d'une issue doit correspondre exactement au candidat
de transition, et l'admission, le budget et les preuves d'exécution restent
nécessaires. La politique conditionnelle garde `executionAuthorized: false`.

La réévaluation transmet désormais le profil structuré de la mission et ses
poids explicites au classement. Les formes `default` des huit topologies ont
aussi des profils d'adéquation documentaire, sans prétendre à un gain mesuré.
Le classement cherche un candidat calibré admissible au-delà d'un meilleur
score non calibré et conserve le candidat proposé même si la liste visible est
bornée. Une proposition calibrée de type `TOPOLOGY` ou `VARIANT` fixe le profil
envoyé au planificateur. Une divergence de topologie ou de variant bloque la
transition avant la composition ; le graphe préparé doit garder un seul nœud
topologique et l'admission vérifie encore son identité et ses préconditions.

## Limites

Le registre est une voie d'entrée pour des issues appariées déjà vérifiées ;
le runtime ne produit pas automatiquement ces paires à partir des rapports des
workers. Aucun corpus de campagne ni gain comparatif n'est présumé. La
qualification exige encore une campagne hors famille de tâches et hors modèle,
avec coûts, latences, verdict indépendant et lien de transition exact.
**Mise à jour du 2026-10-16 :** l'[ADR 0566](0566-lier-les-issues-appariees-aux-transitions.md)
lie chaque nouvelle ligne persistée à deux tentatives et au reçu scellé de la
transition. Le registre écarte les anciennes lignes sans ces preuves. La lecture
est stratifiée par candidat et split, jusqu'à 8192 lignes au total ; son coût
sur un grand corpus réel reste à mesurer.

## Alternatives

- Déduire un gain des scores de workers de la mission courante : rejeté ; ils
  ne sont ni une comparaison appariée ni un verdict indépendant.
- Accepter des lignes de calibration fournies par une mission sans reçu :
  rejeté par le registre et le calibrateur.
- Partager les lignes sans périmètre : rejeté pour éviter la contamination
  entre projets et organisations.
