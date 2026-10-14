# ADR 0470 — Budgets d’inférence locale pour Trinity

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Temps d’exécution des workers Trinity avec modèles locaux.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0364, autorité budgétaire des dispatches Trinity.

## Contexte

Les dispatches Trinity pouvaient déclarer un budget de mission supérieur à la
limite effective du worker. Les contrats canoniques des workers bornés,
spécialistes, vérificateurs et rouges retombaient à 300 secondes. Le runtime
local divisait en outre le budget de latence par trois tentatives, puis en
prenait 60 %, ce qui limitait chaque appel modèle à 120 secondes pour un budget
de 300 secondes. Une inférence observée à environ 337 secondes ne pouvait donc
pas aboutir avec ces plafonds.

## Décision

Porter à 540 secondes le plafond de temps des quatre types de workers qui
exécutent les mondes Trinity courants. Le budget de latence global reste fourni
par la requête et continue de borner la durée totale du runtime. Une tentative
modèle locale peut recevoir jusqu’à 75 % de ce budget ; le garde-fou global
interrompt les retries lorsque le temps total est écoulé.

Porter à 900 secondes le plafond de supervision Trinity. Cette fenêtre laisse
jusqu’à neuf minutes aux workers concurrents et du temps à la comparaison et à
la promotion. Les budgets de tokens et de coût restent explicites, persistés et
appliqués par le scope modèle existant.

Le budget de tokens alloué par monde est propagé dans le contrat canonique du
worker. Les workers bornés, spécialistes, vérificateurs et rouges acceptent
jusqu’à 20 000 tokens, sous réserve du plafond par monde et du scope parent
persisté; le plafond par défaut de 8 000 tronquait certaines sorties avant leur
validation.

## Conséquences

### Positives

- Une génération locale de plusieurs minutes peut finir sans dépasser le
  budget de mission déclaré.
- Les retries restent bornés par le garde-fou global de latence.
- L’augmentation des délais ne transforme pas une sortie invalide ou sans
  preuve en succès ; la comparaison Trinity continue d’exiger les rapports
  substantiels de chaque monde.

### Négatives

- Le temps maximal augmente pour ces catégories dans tous leurs usages, pas
  uniquement Trinity. Les plafonds de coût, de tokens, d’autorité et de preuve
  restent inchangés.
- Une inférence lente peut toujours échouer si elle dépasse le budget global
  ou si sa réponse ne passe pas la validation.

## Alternatives

- Garder les limites de 300 secondes : incompatible avec les 337 secondes
  mesurées sur un worker.
- Augmenter uniquement le timeout de supervision : insuffisant, car les limites
  canoniques des workers et le délai de chaque tentative resteraient plus courts.
- Reproduire l’inférence locale dans un scope manuel : écarté, car le scope
  persisté et son budget parent restent l’autorité d’exécution.

## Vérification attendue

Vérifier le plafond de supervision à 900 secondes et exécuter une mission
Trinity avec des plafonds explicites de tokens, de coût et de latence. La
réussite exige la fin des trois workers et le passage de la barrière de
comparaison avec des rapports probants.
