# Maîtrise du Déterminisme de l'IA et Gestion du Rejeu (Reproducibility)

Obtenir un déterminisme absolu (100% bit-à-bit) avec des modèles de langage (LLMs) dans des environnements de production ou via des API externes est aujourd'hui techniquement très difficile, voire impossible. Cependant, il existe des leviers pour maximiser la reproductibilité lors du rejeu et des stratégies architecturales pour pallier les variations inévitables.

## 1. Les leviers techniques pour maximiser le déterminisme

Pour garantir au maximum que l'IA produise la même sortie lors du rejeu d'une expérience, les paramètres de génération suivants doivent être configurés :

- **Température à 0 (Greedy Decoding) :** C'est la règle d'or pour le déterminisme. En réglant la température sur 0.0, vous forcez le modèle à toujours sélectionner le token suivant ayant la plus forte probabilité. Cela supprime l'aspect aléatoire de l'échantillonnage ("sampling").
- **Utilisation du paramètre seed :** Des fournisseurs comme OpenAI permettent de spécifier un "seed" (graine aléatoire). En utilisant le même seed, le système fera un effort (best-effort) pour échantillonner de manière déterministe. *(Note : si la température est à 0, le seed a un impact négligeable car il n'y a plus d'échantillonnage aléatoire, mais c'est une bonne pratique de le fixer tout de même).*
- **Fixer le paramètre top_p à 1 (ou le laisser inactif) :** Si la température est à 0, top_p est ignoré. Mais pour des rejeux à température > 0, fixer top_p et seed est obligatoire pour tenter de reproduire la sortie.

## 2. Pourquoi le déterminisme total échoue-t-il souvent ? (Côté fournisseur)

Même avec Temperature=0 et un Seed constant, des variations peuvent survenir lors des rejeux à cause de l'infrastructure sous-jacente des fournisseurs (OpenAI, Anthropic, etc.) :

- **L'architecture matérielle (GPU) :** Les opérations de calcul massivement parallèles (notamment les calculs en virgule flottante dans les mécanismes d'attention) ne sont pas strictement associatives. Si la charge (load balancing) redirige votre requête vers un autre type de GPU ou de cluster, de micro-variations de calcul modifieront le token sélectionné.
- **Mises à jour silencieuses :** Les fournisseurs ajustent constamment leurs poids de modèles, leurs méthodes de quantification ou leurs configurations backend sans changer le numéro de version publique de l'API.
- **Batching dynamique :** La façon dont la requête est regroupée (batched) avec les requêtes d'autres utilisateurs sur les serveurs du fournisseur introduit un bruit non-déterministe.

## 3. Gérer l'impossibilité technique : Les Stratégies de Compensation

Puisque le LLM ne peut être rendu parfaitement déterministe, la solution consiste à déplacer l'exigence de déterminisme du modèle vers l'architecture qui l'entoure.

### A. Surveillance du `system_fingerprint`
Des fournisseurs comme OpenAI renvoient désormais un `system_fingerprint` dans les réponses API. Cette empreinte change dès que la configuration backend du modèle est modifiée.
- **Gestion avec GenOS :** Lors d'un `genos_record_experience` (ou via l'enregistrement d'événements), ce fingerprint est logué. S'il change lors d'un rejeu (`genos_replay`), GenOS sait instantanément que la variation de sortie ne vient pas des hyperparamètres locaux, mais d'un changement d'infrastructure côté fournisseur.

### B. Validation Déterministe en Aval (Post-processing)
Ne faites jamais confiance au LLM pour formater parfaitement une sortie critique.
- **Gestion avec GenOS :** Forcez l'utilisation du mode JSON (Structured Outputs), puis passez la réponse du LLM dans un validateur déterministe strict (ex: sérialisation typée stricte en Rust). Si la variation non-déterministe du LLM casse le schéma, le validateur (qui est 100% déterministe) déclenche une erreur et active un Fallback (ex: `FallbackProvider` ou `DegradationProvider`).

### C. Évaluation par "Golden Dataset" (Évaluation Sémantique)
Lors du rejeu, au lieu d'exiger une égalité parfaite des chaînes de caractères (`String A == String B`), passez à une évaluation sémantique.
- **Gestion avec GenOS :** Utilisez `genos_evaluate_trajectories` pour comparer la nouvelle sortie avec le "Golden Dataset" (résultats de référence validés) en utilisant une métrique d'évaluation sémantique (ex: similarité cosinus, BERTScore, ou "LLM-as-a-judge"). Tant que le sens ou l'extraction de données reste identique, le rejeu est considéré comme un succès.

> [!IMPORTANT]
> En ingénierie IA (MLOps), il est admis que la résilience et la validation robuste sont bien plus efficaces que la poursuite obsessionnelle d'un déterminisme parfait à 100%, qui reste une illusion face aux infrastructures API mutualisées.
