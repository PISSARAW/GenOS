# ADR 0149 — Attention contrôlée par son modèle

Le modèle prédit la demande des spécialistes depuis l’état courant, attribue
un budget de leases et mesure ensuite l’accord avec les requêtes réellement
observées. Une réallocation est une intervention explicite; les leases seuls
ne valent pas preuve de la prédiction.
