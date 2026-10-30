# Schéma des propositions de code locales

Le schéma demandé au fournisseur et le parseur local exigent entre un et douze
patches, ainsi qu'une ou deux commandes de test sous forme de chaînes.
Chaque patch contient soit le contenu complet, soit des éditions exactes ;
les deux représentations ne peuvent pas être présentes ensemble. Les ancres
des éditions exactes sont non vides. Le mode de remplacement imposé n'accepte
que le contenu complet.

Les contrôles de chemins sûrs, de taille en octets, d'unicité d'ancre et de
commandes autorisées restent effectués après réception. Le schéma fournisseur
ne remplace pas ces validations exécutables.

Les détails de préparation du prompt et de validation d'artefact sont regroupés
dans `workerLocalStageDetails.js`. La barrière locale garde l'ordre des étapes :
préparation, génération, contrôle du budget et de l'autorité, exécution de la
proposition puis validation de l'artefact. L'extraction ne change pas les gates.
