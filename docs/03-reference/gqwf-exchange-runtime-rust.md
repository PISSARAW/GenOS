# GQWF Exchange dans le runtime Rust

Le profil natif `integer_sum` stocke ses objets et sa tête dans SQLite. Les tables
`protocol_gqwf_objects`, `protocol_gqwf_candidates` et `protocol_gqwf_heads`
appartiennent au même magasin transactionnel que le journal de mission. Ce
profil ne publie aucun fichier arbitraire dans le workspace et ne prétend pas
fournir les références de catalogue du moteur GQWF Node.

Le magasin producteur et le magasin coordinateur ont des espaces de noms
distincts, dérivés de la mission, de l'incarnation et de l'acteur. `offer` importe
les octets source conservés par le vrai `READ` OMEGA, le résultat observé du
producteur et la fermeture d'exécution. `receive` copie ces trois objets dans
l'espace du coordinateur et vérifie leurs empreintes. Une clé SHA sans octets
disponibles ne vaut pas transfert.

La fermeture lie la source brute, l'empreinte du tableau décodé, le résultat, la
base avec sa génération, le contexte SYNAPSE, la politique, l'environnement,
le reçu producteur et la commande bornée `native.integer_sum/v1`. Chaque
vérification physique relit les octets CAS, les rehashe, redécode le tableau et
contrôle ses bornes. Le descripteur conserve l'origine `isolated` ; recevoir,
vérifier ou promouvoir ne la transforme pas en observation d'un système réel
extérieur au domaine de calcul.

La base initiale est un véritable objet CAS `null` à la génération zéro. Son
événement `INITIALIZE_UNEXECUTED_BASE` ne signifie pas qu'un calcul a réussi.
Une initialisation répétée relit la tête existante et ne la réinitialise jamais.

`verify` exige un agrégat opaque constitué d'un producteur et de deux processus
de vérification distincts. Leurs valeurs d'entrée décodées et leurs résultats
doivent correspondre aux objets reçus. L'admission EVIDENCE et les trois
contextes SYNAPSE sont contrôlés sur la connexion autoritative. Un hash de reçu
déclaré ne remplace pas ces contrôles.
Les vérificateurs sont distincts par processus et par méthode de somme, avec un
binaire commun. Cette séparation ne prouve pas une indépendance statistique.

`prepare` ne publie rien. `commit` revalide les objets, les preuves et le contexte,
puis compare atomiquement l'ancienne tête et sa génération. La mutation CAS,
le reçu de publication immuable, le reçu OMEGA `EMIT` et le statut de mission
`completed` utilisent la même transaction SQLite. Une seconde branche préparée
sur l'ancienne base doit être réévaluée ; ses anciens tests ne deviennent pas
applicables à la nouvelle base.

Le rejeu d'un commit restitue un reçu historique sans réappliquer la tête.
`publication` et `result_bytes` revalident l'incarnation courante, les objets et
les preuves avant la restitution. Le reçu contient toujours
`external_effects_authorized: false` : publier un résultat n'autorise ni livraison,
déploiement, paiement, ni effet réseau. Les écritures CAS partagent une seule
connexion transactionnelle ; aucune atomicité entre magasins distants n'est
revendiquée.

Les tests ciblés sont `mission_protocol_gqwf` dans `genos-orchestrator`. Le
parcours positif et la reprise sans relance sont aussi exercés par le moteur CLI.
