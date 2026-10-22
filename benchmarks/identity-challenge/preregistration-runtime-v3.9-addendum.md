# Addendum préconfirmatoire v3.9 — budget borné des réponses LLM

Date : 2026-10-22, avant toute nouvelle génération.

La base du run C v3.8 confirme `actual_tokens: 9304` contre un plafond de 8 192; l'erreur du runtime mentionnait le coût alors que `actual_cost_usd` était nul. Les missions v3.9 disposent toutes d'un plafond total identique de 20 000 tokens et d'un plafond de coût de 1 USD. La génération de chaque réponse d'expérience est limitée à 1 024 tokens; les réponses attendues sont de courts objets JSON.

Ce plafond réduit les sorties interminables et donne au raisonnement et à l'artefact specialist une marge supérieure à la sortie mesurée lors du smoke C v3.4. Il est commun à tous les scénarios, bras et répétitions. Les seuils, champs attendus, références et critères de score restent inchangés. Les runs précédents ne sont pas réévalués.
