# Résultats des missions live Biocénose — 2026-10-04

- **Statut** : campagne réelle exécutée; aucune mission n'a atteint une décision finale.
- **Périmètre** : les 12 prompts « Très complexe » du document utilisateur, un par variant.
- **Modèle** : Ollama local `qwen2.5-coder:7b`.
- **Rapport détaillé** : [biocenose-live-results-2026-10-04.json](biocenose-live-results-2026-10-04.json).

## Résumé

**0/12 décisions finales; 12/12 missions bloquées.** Les appels au modèle ont eu
lieu, mais le runtime a refusé de poursuivre quand les réponses ne respectaient
pas les contrats ou quand le fournisseur a échoué. Aucun blocage n'a été
requalifié en réussite. Ces observations répondent à cette configuration et à
ce modèle; elles ne prouvent pas le comportement de tous les modèles possibles.

| Variant | Résultat live | Étape d'arrêt | Durée (s) |
|---|---|---|---:|
| Epistemic Jury | Bloquée — `BIOCENOSE_BELIEF_UPDATE_INVALID` | `collect_belief_revisions` | 70,1 |
| Delphi Community | Bloquée — `BIOCENOSE_JUDGMENT_INVALID` | `collect_sealed_judgments` | 6,5 |
| Adversarial Assembly | Bloquée — erreur HTTP 500 Ollama, limite de répétition de tokens | `collect_sealed_judgments` | 8,9 |
| Forecasting Crowd | Bloquée — `BIOCENOSE_ARGUMENT_INVALID` | `build_argument_graph` | 154,2 |
| Argumentation Community | Bloquée — `BIOCENOSE_ARGUMENT_INVALID` | `build_argument_graph` | 63,9 |
| Polycentric Council | Bloquée — `BIOCENOSE_BELIEF_UPDATE_INVALID` | `collect_belief_revisions` | 15,4 |
| Byzantine-Resilient Community | Bloquée — `BIOCENOSE_ARGUMENT_INVALID` | `build_argument_graph` | 304,2 |
| Minority-Preserving Jury | Bloquée — `BIOCENOSE_BELIEF_UPDATE_INVALID` | `collect_belief_revisions` | 109,9 |
| Representative Community | Bloquée — `BIOCENOSE_JUDGMENT_INVALID` | `collect_sealed_judgments` | 28,2 |
| Persistent Community | Bloquée — `BIOCENOSE_BELIEF_UPDATE_INVALID` | `collect_belief_revisions` | 61,2 |
| Human–AI Deliberation | Bloquée — `BIOCENOSE_BELIEF_UPDATE_INVALID` | `collect_belief_revisions` | 48,1 |
| Hybrid Oracle Community | Bloquée — `BIOCENOSE_ARGUMENT_CLAIM_UNKNOWN` | `build_argument_graph` | 30,8 |

La durée totale reportée est d'environ **901 secondes** (15 min 1 s), hors
préparation et fermeture du runner. Byzantine a mobilisé 13 membres; le panel
représentatif a été tiré parmi 100 profils. Les quatre premières missions ont
utilisé six membres; les suivantes un générateur, un reviewer et un vérificateur
(plus le facilitateur), sauf ces deux quotas particuliers. Delphi a conservé
les rounds définis par sa constitution.

## Méthode et limites

- Les prompts ont été extraits du fichier joint par l'utilisateur; la sélection
  reprend les douze cas rouges identifiés comme « les 12 tests les plus
  discriminants » dans ce fichier.
- Les missions ont appelé le vrai service Biocénose et le vrai routeur de modèle,
  avec Ollama local. Ce n'est pas la matrice synthétique de tests.
- Tous les membres ont utilisé le même modèle. Des lignages et, pour le cas
  Byzantine, des domaines fournisseurs distincts ont été déclarés pour exercer
  les politiques, mais le fournisseur effectif restait Ollama et le modèle
  restait identique. Cela ne démontre donc pas l'indépendance des erreurs.
- Aucun reçu de vérification déterministe n'a été inventé pour Hybrid Oracle;
  aucune décision humaine n'a été ajoutée à Human–AI. Ces autorités ne sont pas
  simulées comme preuves de succès.
- La persistance de la télémétrie a émis `GENOS_ADMIN_PASSWORD must be configured
  before creating the default administrator`. Les événements de ces essais ne
  doivent donc pas être considérés comme durablement persistés; les résultats
  du runner ont été sauvegardés séparément.
- Un contrat de réponse explicite a été ajouté au prompt de révision. Pendant le
  pilote Epistemic, le modèle a tout de même renvoyé `changedClaims`,
  `reasonCodes` et `evidenceRefs` sans `previousPosition` ni `newPosition`; le
  validateur a correctement bloqué l'enregistrement.

## Conclusion de preuve

Cette campagne ne permet pas de répondre « oui partout ». Elle montre que les
douze variants sont atteignables dans le runtime jusqu'à des étapes différentes,
mais que la réussite sur missions réelles n'est pas établie avec ce modèle et ces
contrats de sortie. Plusieurs variants déclarés exécutables échouent également
avant le jugement final; les noms `EXECUTABLE` et les tests déterministes ne
remplacent donc pas une validation par réponses réelles et preuves indépendantes.
