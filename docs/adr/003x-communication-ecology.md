# ADR 003x — Communication Ecology Invariants

- **Statut** : Accepté
- **Date** : 2026-09-27 (amendé le 2026-11-15)
- **Domaine** : Communication, cognition, distribution
- **Lié à** : [ADR 0030](0030-immunite-epistemique-et-composition.md), [ADR 0031](0031-scheduler-epistemique-mathematique.md), implémentation `backend/src/services/communication/` (enveloppe, dialecte, Common Ground, Transactive Memory, Policy Engine), `backend/src/services/signalDeliveryService.js`, `signalReceptorService.js`, `signalRepressorService.js`, `selectiveSignalService.js`, tests `backend/tests/test_signal_plane_e2e.js`, `test_communication_learning.js`, `test_communication_metrics.js`

## Contexte

GenOS V3 introduit une couche de décision communicationnelle au-dessus de l'infrastructure existante. Le Signal Plane reste zero-text ; le verbal devient une ressource cognitive rare. Ce document définit les invariants non négociables qui protègent GenOS contre une dérive progressive vers un système multi-agent bavard.

## Décision

Les 12 invariants suivants sont désormais non négociables :

1. **Silence par défaut.** Aucune sortie par défaut ; la communication doit être justifiée.

2. **Aucun LLM n'est réveillé si une réponse déterministe suffit.** Le système préfère les chemins algorithmiques ou stigmergiques avant toute escalade LLM.

3. **Un changement observable de l'environnement vaut communication s'il suffit au destinataire.** Si l'environnement change de façon que le destinataire puisse en déduire ce qu'il lui faut, c'est une communication effective sans message explicite.

4. **Ne transmettre que le delta de connaissance utile.** Seuls les connaissances nouvelles ou non-grounded chez le destinataire sont transmis ; le reste est omis par le Common Ground Ledger.

5. **Broadcast de transport ≠ broadcast cognitif.** Le transport de paquets (signal/stigmergy) peut être global, mais le brouillage cognitif est sélectif et mesuré.

6. **La proximité sociale/n_family n'accorde jamais d'autorité.** Le graphe social fournit un prior de routage, jamais une preuve de compétence ou de fiabilité.

7. **Proximité sociale ≠ indépendance épistémique.** Même un agent familier peut avoir une faible indépendance épistémique ; la vérification indépendante reste nécessaire.

8. **Le langage est utilisé seulement lorsqu'une représentation structurée serait insuffisante.** Le verbal (micro-utterance, dialecte compilé, dialogue borné) n'est permis que quand le stigmerge/formalisme ne suffit pas.

9. **Une conversation récurrente doit devenir candidate à la compilation en protocole.** Si la même phrase/question revient avec fréquence élevée et variance sémantique faible, GenOS propose un symbole dialectal (compilation candidate).

10. **Tout dialogue verbal doit produire un artefact structuré ou se terminer explicitement `UNRESOLVED`.** Aucun "Good discussion, we agree." sans artefact formel.

11. **Les économies de tokens doivent être mesurées sur les usages réels du modèle, pas estimées par `chars / 4`.** Les compteurs réels fournisse/runtime remplacent toute estimation heuristique.

12. **L'escalade cognitive est explicitement autorisée.** Un signal sans récepteur
    déterministe reste une livraison structurée. Il ne devient une requête LLM que si
    l'émetteur pose `allow_cognitive_escalation=true` et si le gate de valeur de
    l'information l'accepte. `dynamicOrganizationService.publish()` conserve son garde
    `ZERO_TEXT_REQUIRED`.

L'amendement du 15 novembre 2026 précise la fermeture de la boucle :

- un worker idle conserve son abonnement durable et consomme une livraison dans un
  ledger d'observations sans reconstruire une mission textuelle ;
- une phéromone persistée est adressée aux workers de son scope et sa consommation
  renforce la route observée ;
- une trace de checkpoint équivalente et encore valide produit `SILENCE`, ce qui évite
  la répétition du même delta ;
- une inférence explicitement admise porte `action_id=signal:<id>` dans le ledger des
  tentatives modèle. Les tokens et coûts ne sont complets que lorsque les reçus
  fournisseur le sont ; une couverture absente ou partielle reste déclarée ainsi.

## Conséquences

- Tous les nouveaux services (Common Ground, Transactive Memory, Policy Engine) doivent respecter ces invariants.
- Le mode shadow reste disponible pour observer une politique avant activation.
- Tout échec à respecter un invariant provoque un rejet de la décision et journalisation `epistemic_violation`.
- L'ancien réveil automatique sur tout signal non reconnu est supprimé : il produisait
  des prompts sans mandat et rendait le coût du cycle natif trompeur.

## Alternatives

- Conserver l'escalade implicite sur absence de récepteur : rejeté, car l'absence de
  règle déterministe n'est pas une autorisation de dépenser des tokens.
- Injecter chaque phéromone brute dans le prochain prompt : rejeté, car cela transforme
  une trace environnementale en contexte textuel répétitif et favorise la contamination.
- Compter la publication comme une livraison : rejeté, car la persistance du paquet ne
  prouve ni sa consommation ni son grounding.
