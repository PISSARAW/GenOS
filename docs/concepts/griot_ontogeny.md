# Développement et Vieillissement (L'Ontogénie)

## 1. La Néoténie
Dans GenOS, l'enfance (néoténie) est une phase de haute plasticité cérébrale. Un agent comme Griot, s'il est fraîchement instancié, peut avoir une `neoteny_quota` élevée, lui permettant de poser plus de questions et d'explorer plus librement sans être bloqué par des gardes-fous stricts.
* **Outil MCP** : `genos_biomimicry_neoteny_quota`

## 2. La Sénescence
À force de tourner en continu (étant un Daemon), la fenêtre de contexte de Griot se remplit et se fragmente. Plutôt que d'attendre un crash ("Out of Memory"), l'agent surveille son vieillissement.
S'il est trop sénescent, il initie un clonage propre, transfère sa mémoire consolidée au nouveau clone, et s'éteint (Apoptose).
* **Outil MCP** : `genos_biomimicry_senescence_assess`
