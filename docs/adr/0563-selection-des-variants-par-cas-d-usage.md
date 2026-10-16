# ADR 0563 — Sélectionner les variants par cas d'usage documenté

- **Statut** : Accepté pour la présélection heuristique ; calibration comparative à produire
- **Date** : 2026-10-16

## Contexte

Les huit fiches de topologie décrivent les cas d'usage, préconditions et frontières
des 95 variants canoniques. Les sélecteurs locaux appliquent surtout des motifs
textuels et des priorités fixes. Le classement morphogénétique produisait un
`estimatedProblemFit` neutre (`0.5`) pour les variants sans affinité déclarée.
Une mission cumulant plusieurs besoins pouvait donc dépendre de l'ordre des
motifs, tandis que la politique conditionnelle ne disposait pas d'un signal
d'adéquation propre au variant.

## Décision

Un catalogue compact de 95 profils condense les signaux discriminants des huit
fiches. Morphogenèse compare les termes normalisés de la mission et les besoins
structurés fournis dans `problemProfile`, puis évalue tous les profils de la
topologie demandée. Le score tient compte de la rareté des termes dans cette
topologie. Les priorités explicitement déclarées par la mission comptent davantage.

Le sélecteur local reste une seconde observation. Si son choix possède un signal
explicite, le catalogue ne le remplace que lorsque le variant concurrent présente
un écart documentaire fort. Une égalité ou une information insuffisante ramène
à une forme de base sûre ; la sélection et ses alternatives figurent dans le reçu.
Pour Holobionte, les profils incompatibles avec `analyzeFit` sont exclus et leurs
préconditions manquantes sont rapportées. Le choix explicite d'un variant conserve
sa priorité et passe toujours les contrôles du runtime.

L'adéquation documentaire alimente aussi `estimatedProblemFit` des candidats
variants de la politique morphogénétique conditionnelle. Elle reste marquée
`uncalibrated` et ne crée ni gain attendu, ni autorisation d'exécution. Une
transition exige toujours les résultats vérifiés, la calibration hors famille
et les gates de budget et de preuve existants.

## Conséquences et limites

- Les 95 variants disposent d'un profil de présélection et d'un motif lisible.
- Le parcours renvoie une variante compatible ou un repli explicite ; il ne
  promet pas de choisir la meilleure variante dans chaque mission.
- La détection lexicale peut manquer une paraphrase, et les préconditions des
  sept autres topologies restent contrôlées par leurs runtimes locaux.
- Les profils doivent être revus quand les fiches ou contrats de variant changent.
  Leur adéquation réelle nécessite une campagne comparative appariée sur des
  tâches inédites, avec coût, latence et verdict indépendant.

## Alternatives considérées

- Conserver uniquement les priorités des sélecteurs locaux : les conflits de
  signaux restent arbitraires et le classement morphogénétique reste neutre.
- Laisser un modèle choisir librement parmi 95 noms : pas de précondition
  vérifiable ni de reproductibilité suffisante au point d'admission.
- Déduire la valeur d'un variant de sa maturité : elle mesure une couverture
  d'implémentation, pas son adéquation à une mission.

## Suivi 2026-10-16

- Une table déterministe de synonymes (FR/EN) canonise les paraphrases vers le
  vocabulaire documenté avant l'appariement, des deux côtés (mission et profils).
- Les besoins implicites (ex. « tradeoff », « mode avion ») sont inférés du texte
  de mission vers les signaux structurés, sans élargir les seuils de décision.
- Chaque reçu de sélection porte `evidenceKind: 'documentary_heuristic'` et
  `predictsSuccess: false` ; `fitEvidence` expose la même base pour `candidateFit`.
  La limite demeure : heuristique documentaire, pas une prédiction de réussite.
