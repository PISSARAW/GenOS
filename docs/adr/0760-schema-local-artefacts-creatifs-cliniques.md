# ADR 0760 — Schémas locaux des artefacts créatifs et cliniques

## Statut

Accepté le 30 octobre 2026.

## Contexte

Le fournisseur recevait seulement `content: { type: object }` pour les artefacts
créatifs et cliniques, alors que le validateur runtime exige des champs précis.
La campagne a aussi demandé des informations manquantes et des signes d'alerte
dans la vignette éducative, mais le contrat clinique interdisait ces deux clés.
Les anciens résultats restent conservés avec leur véritable évaluation.

## Décision

Décrire les champs du candidat et du rapport clinique dans le schéma fournisseur.
Un candidat contient son texte complet, ses hypothèses et son test de réfutation.
L'instruction impose une seule sérialisation JSON et un unique emplacement du
texte ; aucun assesseur ne remplace des `\\n` par des sauts de ligne pour faire
passer une réponse non conforme.

Les réponses cliniques locales possèdent deux tableaux explicites :
`missingInformation` et `emergencyWarningSigns`. Ils peuvent être vides pour une
mission qui ne demande pas ces sections. Le runtime accepte ces champs s'ils
sont des tableaux de textes, tout en gardant ses interdictions de diagnostic et
de prescription. Les anciens rapports sans ces tableaux restent lisibles.

## Conséquences et alternatives

Les champs sont contrôlés avant acceptation du format, sans certifier leur
contenu. Une couverture structurelle complète ne qualifie jamais une réponse
clinique. Le test utilise le véritable schéma AJV et le validateur runtime ; il
ne constitue ni une génération Qwen ni une évaluation médicale.

Corriger le texte créatif après génération aurait masqué un échec du modèle.
Rendre immédiatement les champs cliniques obligatoires pour tous les artefacts
persistés aurait invalidé les rapports historiques et le chemin déterministe.
