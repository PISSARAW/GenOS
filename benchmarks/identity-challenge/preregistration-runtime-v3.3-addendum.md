# Addendum préconfirmatoire v3.3 — contrat de mission adapté au défi d'identité

Date : 2026-10-22, avant la prochaine génération des défis A/B/C.

L'inférence réelle C v3.2 a montré le WorkerSelf complet (58 %, référence autorisée) mais s'est abstenue. Son prompt exact imposait encore `bounded_worker.scopeCompletion`, avec des références vers des sorties de travail que le défi cognitif ne produit pas. Le format de claim corrigé en v3.2 n'avait donc pas supprimé le conflit de contrat.

Pour toutes les missions d'expérience A, B et C, le runtime sélectionnera désormais le `workerKind: specialist` avec la niche commune `identity continuity and causal self-model analysis`. Cette sélection est identique dans les quatre bras et ne modifie ni le contenu visible des traitements, ni les IDs, ni les seuils, ni les preuves autorisées. Elle remplace la demande de références à des fichiers terminés par l'artefact spécialisé GenOS existant : claims étayées, évaluation de niche et références de provenance. Le worker conserve la même identité de session authentifiée et le même WorkerSelf conditionné par le bras.

Les champs de scénario et de bras seront conservés dans le reçu prompt. L'oracle A/B/C demeure inchangé depuis v3.2; les résultats des versions précédentes restent diagnostiques et ne sont pas réétiquetés. Cette correction de contrat s'applique avant les prochaines générations réelles et avant la campagne confirmatoire.
