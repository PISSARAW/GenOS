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
