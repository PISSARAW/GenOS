# Réutiliser les preuves agentiques dans une transaction stable

La lecture d'un artefact délégué reconstruit ses reçus, les observations natives,
les contextes et les preuves de livraison. La clôture et le replay répètent ces
lectures. La reproduction ciblée prend environ 66 secondes puis 32 secondes,
avec huit appels HTTP locaux seulement. Sous charge, cette répétition peut
épuiser l'autorité de 120 secondes. Le budget des appels reste de 60 secondes.

Les observations de modèle déjà entièrement vérifiées peuvent être réutilisées
dans la même transaction SQLite immédiate, sur la même connexion et le même fil.
La première lecture conserve tous les contrôles : empreintes, contexte, acteur,
enveloppe native, émission et événement de preuve. Seul son résultat vérifié est
mémorisé. Les refus ne sont jamais mémorisés.

Le périmètre est détruit à la fin de la transaction. Toute variation de
`sqlite3_total_changes`, y compris une écriture depuis un trigger, invalide les
résultats. Une autre connexion ou un autre fil ne les partage pas. La transaction
immédiate interdit une écriture concurrente externe sur cet instantané. La mémoire
est bornée à 32 observations ; au-delà, la vérification complète reste utilisée.

Le contrôle de l'incarnation courante et de son expiration précède chaque accès,
y compris un accès mémorisé. Aucun délai, budget, contrôle d'intégrité ou droit de
publication n'est modifié. La lecture hors transaction ne dispose d'aucune mémoire
de validation. Les périmètres imbriqués restaurent le précédent à leur sortie.

Les tests exercent de vrais reçus d'inférence HTTP locaux, une corruption dans la
même transaction suivie d'un rollback, une corruption depuis une autre connexion,
l'isolation des connexions et le refus d'une autorité falsifiée après mémorisation.
La mission CLI conserve ses huit appels, ses huit outils, ses lectures précoce
refusée et tardive admise, ainsi que son replay sans nouvel appel fournisseur.
