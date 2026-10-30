# Passation produite par un worker local

Le worker `liaison_worker` prépare un dossier pour un groupe destinataire distinct. Il cite les références autorisées des artefacts consultés. Pour des fichiers présents dans sa capsule, activer `readOnlyWorkspaceEvidence` fournit le contenu borné et les références SHA-256 réellement lus.

Une réponse locale comporte `delivery: "parent_dossier"` et `recipientAcknowledged: false`. Cette sémantique est identique à celle de la méthode native `prepare_handoff` : le résultat est remis au parent. Le schéma refuse une affirmation générée d'accusé de réception ou de livraison dans une inbox.

Une livraison effective et son acceptation doivent être établies par un transport autorisé et ses reçus. Le texte produit par le modèle ne constitue pas ces reçus. Le statut d'exécution `completed` ne suffit donc pas à qualifier une passation de bout en bout.
