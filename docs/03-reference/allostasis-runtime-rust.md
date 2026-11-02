# ALLOSTASIE dans le runtime Rust

Le profil `integer_sum` comptabilise deux ressources physiques : les places de
processus simultanés et le temps mural observé en millisecondes. Il ne fabrique
pas une facture de modèle, une quantité de tokens, un coût monétaire ou une
mesure CPU à partir de ce temps.

L'allocation est liée à l'admission native intègre, à la mission, à l'incarnation
et à l'acteur. Sa capacité ne dépasse ni les trois processus du profil, ni la
durée `timeout_ms` admise. Une réserve protégée de 5 %, arrondie au supérieur,
reste hors des allocations ordinaires. Avec trois places, une place est donc
protégée et deux processus ordinaires peuvent être actifs simultanément. Le
profil exécuté est séquentiel. La réserve borne l'admission ; elle ne constitue
pas une garantie du planificateur OS ni un mécanisme de récupération automatique.

`expose` inscrit le maximum exposé et occupe une place avant le lancement réel.
Son reçu n'autorise qu'un premier lancement. Un rejeu exact ne réautorise pas
l'exécution ; un autre maximum pour le même identifiant est un conflit. Les
transactions SQLite empêchent deux connexions d'allouer le même disponible.
Le nombre total de processus observés et exposés ne dépasse pas trois par
mission dans ce profil fermé.

`settle` accepte uniquement un `ProcessReceipt` opaque construit depuis un
processus réellement observé. Il comptabilise le temps mural, le PID et le
reçu exact, même si le processus échoue ou dépasse son exposition. La
consommation observée peut donc dépasser la capacité ; elle reste enregistrée
et interdit les allocations suivantes au lieu d'être annulée pour satisfaire
un quota fictif. Le même reçu n'est compté qu'une fois.

Si le lancement ou son observation devient ambigu, l'exposition devient
`unknown` et reste retenue. `release` refuse tant qu'une exposition n'est pas
réconciliée par un reçu réel. Il ne déduit jamais qu'une absence de réponse
signifie zéro consommation. La réconciliation et la lecture historique restent
possibles après expiration ou changement d'incarnation pour régler une exposition
existante ; elles n'autorisent aucun nouveau lancement.

La libération rend les maxima non consommés et ferme l'allocation. Elle ne
soustrait jamais le temps déjà observé ni le compteur irréversible de processus.
Une succession conserve les consommations antérieures et ne peut augmenter
les capacités initiales. Des expositions anciennes non résolues empêchent une
nouvelle allocation ; OMEGA refuse aussi de rejouer les rôles déjà exécutés.
Le profil privilégie donc le refus d'une reprise partielle à une relance aveugle.

Ces garanties portent sur le magasin SQLite autoritatif et les processus lancés
par le moteur natif. Une copie ancienne de la base n'est pas une autorité de
production. Le profil n'implémente ni registre de facturation fournisseur, ni
préemption forcée d'effets externes, ni remboursement après annulation.

Les tests `mission_protocol_allostasis` couvrent notamment la réserve, les
connexions concurrentes, la reprise d'une exposition inconnue et le règlement
irréversible d'un véritable processus échoué.
