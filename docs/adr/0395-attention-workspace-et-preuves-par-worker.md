# ADR 0395 — Attention du workspace et preuve par méthode native

Date : 10 octobre 2026. Statut : adopté pour la qualification progressive.

## Contexte

Le banc des 19 workers montre que la conformité d'un `workerArtifact` ne prouve ni la justesse du résultat ni la sélection des faits pertinents. Le contrôle `require_independent_verification` bloque correctement les résultats sans reçu AEIS. Avec une clé de test, seul `bounded_worker` termine : les 18 autres méthodes n'ont pas de domaine de vérification native. L'API simple `globalWorkspaceService` choisit par saillance et transmet un seul contenu ; AGOW porte déjà un but, plusieurs contenus et des reçus de diffusion.

## Décision

1. AGOW est le chemin canonique pour la sélection, l'intégration et la mesure d'attention dans les missions qui activent ce mode. L'API simple reste compatible et expose les contenus admis aux consommateurs autorisés ; elle ne constitue pas à elle seule une preuve d'attention sémantique.
2. Un worker natif produit d'abord un artefact typé. Une preuve indépendante doit ensuite vérifier une propriété sémantique propre à sa méthode depuis le contrat, l'observation scellée et les données nécessaires. La promotion conserve la signature, le registre de confiance, la liaison au scope et le nonce à usage unique.
3. Le sous orchestrateur n'hérite pas de la preuve de son enfant. Son résultat exige une preuve séparée du choix, de la délégation et de l'agrégation des enfants vérifiés.
4. Le banc publie séparément création, artefact, vérification indépendante, complétion et attention. Une épreuve manquante, expirée ou non discriminante n'est pas marquée réussie.
5. `combine_candidates` exige un but et des indices attribués à des options. Les combinaisons sont classées par correspondance littérale des indices au but, puis par ordre lexical stable. Le reçu expose les scores et les sources retenues. Cette méthode bornée ne certifie pas la qualité, la nouveauté ou la vérité des indices fournis.

## Conséquences

Les domaines natifs manquants doivent être implémentés par familles de méthodes. Une vérification de schéma, la simple réexécution du même algorithme ou un verdict déclaré par le worker ne suffisent pas. Les contenus secondaires d'AGOW doivent être accessibles aux récepteurs et attribués dans les reçus. Les changements du but, l'ordre des sources et l'ablation serviront à tester l'effet causal du mécanisme.
