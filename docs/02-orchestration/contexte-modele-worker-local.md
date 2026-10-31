# Borne explicite du contexte d'un worker local

Le paramètre `localContextTokens` du dispatch direct est transmis au routeur, puis au fournisseur. Sur l'endpoint natif Ollama, il devient `options.num_ctx`. Aucune hausse de fenêtre n'est appliquée par défaut. Le fallback Windows transmet le même paramètre.

Lorsqu'une borne explicite est fournie, le routeur refuse une requête dont l'estimation du prompt plus le plafond de sortie dépasse cette borne, avant tout appel au fournisseur. Le prompt effectivement routé après compilation cognitive est utilisé pour ce contrôle. Le plafond de sortie n'est pas réduit silencieusement.

L'estimation utilise les octets UTF-8 divisés par quatre ; ce n'est pas un tokenizer exact et elle n'inclut pas précisément le template de dialogue du fournisseur. Cette garde ne garantit donc pas l'absence de troncature interne au serveur. La campagne doit enregistrer la fenêtre explicite, les compteurs réellement observés et les diagnostics du serveur. Une borne explicite nécessite l'endpoint natif Ollama ; le fournisseur refuse de l'ignorer sur un endpoint incompatible.

La fenêtre de contexte n'est pas le budget de tokens facturables ou cumulés. Les plafonds parent et worker et les réservations partagées restent appliqués séparément. Une reprise plus longue peut être refusée même si un run précédent tenait dans la fenêtre.
