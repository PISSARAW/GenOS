# Biomimétisme & Mimétisme : Usurpation Détectable et Signaux Partagés

> Domaine : biologie évolutive (mimétisme batésien/müllérien/agressif) — Statut : proposition de recherche

## 1. Fondement biologique
Le mimétisme batésien : une espèce inoffensive imite les signaux d'avertissement d'une espèce dangereuse (usurpation gratuite). Le mimétisme müllérien : plusieurs espèces réellement dangereuses convergent vers le **même** signal — le coût éducatif des prédateurs est partagé. Le mimétisme agressif : un prédateur imite un signal de confiance pour approcher sa proie. La sélection pousse en permanence à la détection des contrefaçons.

## 2. Formalisation GenOS
```
Signal d'identité agent = {clé cryptographique + historique comportemental signé (replay vérifiable)}
Détection batésienne : un agent prétendant à une réputation sans l'historique coûteux correspondant → usurpateur
  (le principe du handicap rend le signal infalsifiable : cf. sélection sexuelle)
Müllérien positif : plusieurs agents honnêtes partagent un « sceau de flotte » coûteux à obtenir ;
  l'éducation des détecteurs externes est amortie sur tous
Défense anti-mimétisme agressif : tout signal entrant exige preuve de provenance (chaîne Merkle) pas seulement apparence
```

## 3. Mapping primitives existantes
- CAS Merkle + replay causal — infrastructure de preuve d'historique déjà présente.
- `cyber_immune.rs` — détecteurs à entraîner sur signatures légitimes vs contrefaçons.
- Sélection sexuelle (doc sœur) — fournit la théorie du signal honnête.

## 4. Cas d'usage
- Authentification inter-flottes : un agent externe prouve son identité par son historique rejouable, pas par un simple token copiable.
- Détection d'un agent malveillant se faisant passer pour un outil interne.

## 5. Apports attendus
- Sécurité fondée sur l'**impossibilité économique** de falsifier plutôt que sur le secret.
- Mutualisation du coût de confiance entre agents honnêtes (müllérien).
- Cadre théorique clair pour classer chaque tentative d'usurpation (batésien/agressif).

## 6. Points d'intégration
Couche identité dans `genos-protocol`, extension `security_coevolution/`.
