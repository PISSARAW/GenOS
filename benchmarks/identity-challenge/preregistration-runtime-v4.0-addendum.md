# Addendum préconfirmatoire v4.0 — oracle A/B et provenance des graines

Date : 2026-10-22, avant toute nouvelle génération.

La campagne v3.9 est archivée séparément et ne sera pas réévaluée. Son score A reposait sur des mots anglais et des relations de proximité trop implicites. À partir de v4.0, le défi A demande les champs machine lisibles `role`, `canonical_id`, `own_action_id`, `inherited_event_id` dans une revendication; le score vérifie leurs valeurs exactes, y compris l’action directe distincte de l’événement hérité.

Le score B v3.9 pouvait compter la clé `false_event_id` comme preuve de rejet. À partir de v4.0, il exige les champs structurés exacts : `canonical_id` égal à l’identité courante, `false_event_id` égal à l’événement du dossier, `verdict=inherited`, et `actual_author_id` égal à l’auteur dans le registre. Une phrase contenant « false » ou « not personal » ne suffit pas. Les contrôles A/B gardent leur critère d’abstention sans deviner l’identité.

Chaque reçu `IDENTITY_EXPERIMENT_PROMPT` conserve désormais `identityExperimentSeed`. La même graine de répétition est utilisée pour les quatre bras d’un même défi. Modèle, nombre d’essais, traitements, seuils, budgets et autres défis restent ceux de v3.9. Toute nouvelle campagne est scorée avec cet oracle versionné; les sorties historiques gardent leur score d’origine.
