# Contrat de benchmark des 12 variants Biocenose

Ce contrat rend les 48 missions comparables et reproductibles. Un PASS signifie que le runtime produit les artefacts décrits et que les invariants indiqués sont contrôlés; une réponse narrative seule ne suffit pas.

## Données explicites pour les missions incomplètes

- **Delphi moyen** : débit des trois méthodes = 8, 11 et 14 dossiers/heure; taux d'erreur mesurés respectifs = 1 %, 3 % et 8 %. L'estimation doit publier séparément durée et erreurs attendues, sans convertir une erreur en coût sans barème fourni.
- **Delphi difficile** : effort de référence par module = simple 0,5 jour, moyen 1,5 jour, complexe 4 jours; capacité nominale = 2 développeurs à temps plein. L'énoncé doit préciser que les estimations sont en jours-personne et afficher l'hypothèse de conversion en jours calendaires.
- **Delphi round 3** : après deux rounds, calculer `spread = (max - min) / abs(median)`; si la médiane vaut zéro, utiliser l'étendue absolue. Un troisième round est requis uniquement si le spread dépasse 25 %.
- **Forecasting calibration** : les historiques doivent être des paires `(probabilité, résultat)` par événement et par domaine. La pondération utilise `max(0, 1 - meanBrier)` multiplié par le poids d'indépendance; si aucun historique comparable n'existe, le membre reste non pondéré et le rapport le signale au lieu d'inventer une calibration.
- **Oracle hybride** : une exigence factuelle est portée par claim, même dans une mission MIXED. Chaque claim factuel a un type de vérification déclaré et un reçu déterministe de confiance vérifiée.
- **Revue humaine** : le succès de la mission normative est la création d'un dossier `HUMAN_REVIEW_REQUIRED`; une décision n'est enregistrée qu'après événement explicite d'un acteur humain.

## Critères minimaux par variant

| Variant | Artefact qui doit être vérifiable | Condition de PASS |
|---|---|---|
| Epistemic Jury | engagements scellés, claims, revues spécialisées, reçus et dissents | chaque claim conserve son statut et ses preuves; aucun vote seul ne promeut un fait |
| Delphi Community | rounds anonymisés, distributions, révisions et dispersion | au moins deux rounds; le troisième suit la règle ci-dessus; dissent conservé |
| Adversarial Assembly | rôle adversarial, challenges et reçus de vérification | absence de reviewer bloque; seul un contre-exemple vérifié déclenche le veto |
| Forecasting Crowd | probabilités, poids, distribution agrégée et scores révélés | question probabiliste seulement; poids et Brier Score traçables |
| Argumentation Community | graphe d'arguments et labels grounded | cycles non résolus restent `UNDECIDED`; aucune conclusion par vote |
| Polycentric Council | roster de conseils, résultats locaux et fédération | dissent local conservé; seuls les conflits requis sont escaladés |
| Byzantine-Resilient Community | domaines de fautes, décisions d'admission, quorum actif | le quorum est recalculé après quarantaine; corrélations ne comptent pas comme indépendance |
| Minority-Preserving Jury | registre complet des dissents et reçus | tout dissent valide est conservé; seuls les contre-exemples confirmés bloquent la promotion |
| Representative Community | population, strates, tirage reproductible, poids, ESS et comparaison de biais | le panel et ses poids proviennent de la population fournie; l'écart de représentation pondéré est comparé au panel naïf premier-N |
| Persistent Community | historique par domaine, réputation, décision d'adhésion | decay, effectif d'échantillon et rotation sont persistés et influencent le roster suivant |
| Human–AI Deliberation | perspectives, dissent et dossier humain | pas de verdict moral automatique; état humain obligatoire |
| Hybrid Oracle Community | classification par claim, vérificateur et reçu | claim factuel jamais `VERIFIED` sans reçu fiable, y compris en MIXED |


## Vérification runtime

`backend/tests/test_biocenose_mission_matrix.js` exécute les 12 variants à quatre tailles de communauté (48 tours runtime) avec SQLite et un simulateur déterministe de membres. Il vérifie les contrats de routage et les artefacts des variants, dont quarantaine Byzantine, conflits polycentriques, rotation persistée, reçu Oracle en MIXED et dossier de revue humaine. Les tests dédiés vérifient aussi qu'un cycle argumentatif reste `UNDECIDED` sous sémantique grounded et maintient le claim non résolu, indépendamment d'un vote, qu'un dissent polycentrique reste conservé localement sans escalade si les outcomes des conseils concordent, et que le quorum Byzantine est recalculé sur le roster actif après quarantaine tout en refusant des domaines de faute corrélés insuffisants. Ce test valide l'intégration du runtime; il ne mesure pas la justesse sémantique des réponses d'un fournisseur de modèles sur les 48 prompts originaux.
