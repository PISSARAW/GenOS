# ADR 0795 — Observation typée du daemon d'allocation

- **Statut** : accepté.
- **Date** : 2026-11-04.
- **Portée** : runtime local Node, `resident_daemon`, contrat de workspace
  `resource_allocation` en mode `observation`.

## Contexte

La [relance réelle précédente](../06-qualite-preuves/cooperation-llm-constat-daemon-2026-11-04.md)
échoue avant le planificateur : le modèle produit plusieurs claims ou une chaîne
non JSON, et annonce une anomalie sur une allocation saine. Le schéma générique
du fournisseur autorise une chaîne libre alors que les oracles d'allocation
attendent exactement un énoncé contenant un objet JSON.

## Décision

Une mission de daemon portant ce contrat scellé utilise le format fournisseur
`genos.daemon-allocation-observation/v1`. Le modèle produit directement
`observation: {observedSum, target, anomaly}`, des références de preuve et un
rapport de territoire. Les sommes et la cible sont des entiers, l'anomalie est
un booléen. Le schéma ne contient aucune valeur arithmétique attendue.

Le runtime valide la réponse brute sans coercition, sans extraction de texte
et sans suppression de propriétés. Une observation valide est sérialisée par
`JSON.stringify` dans un unique claim compatible avec les oracles existants.
Cette projection ne calcule aucune somme et ne change aucune valeur. Le dossier
conserve le texte brut ainsi que son empreinte SHA256, liant la projection à sa
réponse source. Les oracles recalculent toujours depuis les sources scellées.

Le format possède une branche d'abstention explicite : `outcome: unresolved`,
`observation: null` et incertitudes non vides. Elle ne crée aucun claim et ne
déclenche aucune planification. Une réponse ancienne ou mal formée est refusée,
sans conversion permissive en observation.

Les instructions de sortie et le schéma fournisseur sont sélectionnés depuis
le même contrat assigné. La mission du pilote décrit la somme sur les indices
sélectionnés et n'exige plus une chaîne JSON en doublon. Les autres missions et
types de workers conservent leur format existant.

## Conséquences

- Le modèle n'a plus à échapper un objet JSON à l'intérieur d'une chaîne libre.
- Une allocation saine reste un résultat admissible, avec `anomaly: false`.
- Les références doivent couvrir les sources immuables du contrat ; le territoire
  est lié au fichier d'allocation assigné.
- Une réponse syntaxiquement valide peut être fausse : le veto des deux oracles
  natifs reste obligatoire avant de rendre le constat admissible au planificateur.
- Le format brut et le dossier interne sont distincts et leur relation est
  vérifiable par sérialisation et empreinte, sans prétendre vérifier le calcul.

## Alternatives

Renforcer uniquement les consignes laisse le fournisseur accepter des chaînes
libres. Une expression régulière sur ces chaînes conserverait le double encodage
et rendrait la prise en charge des nombres plus fragile. Réparer automatiquement
les anciens énoncés ou injecter les résultats attendus masquerait les refus.

Étendre ce format à tous les daemons sans contrat métier observable ne serait
pas justifié par ce protocole borné.

## Vérification

Le test du contrat couvre sérialisation, provenance, abstention, anciens formats,
types incorrects, propriétés étrangères et références non admissibles. Il vérifie
que les deux méthodes natives acceptent un constat sain et réfutent un faux
positif sans que la projection le corrige. L'intégration du pilote couvre les
dispatchs, capsules, reçus et arrêts. Les réponses HTTP contrôlées sont distinguées
de toute qualification réelle du modèle.

Voir le [guide d'exploitation](../02-orchestration/contrat-sortie-daemon-allocation.md).
