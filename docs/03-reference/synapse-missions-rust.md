# SYNAPSE dans les missions Rust

`mission_protocols::synapse` porte le contexte réellement consommé par les jobs
du profil natif `integer_sum`. Le schéma installé est
`genos.rust-integer-sum-context/v1` : fichier source identifié par ses octets,
tableau non vide d'au plus 4096 entiers `i64` entre −1000000 et 1000000, digest du
tableau, base CAS exacte (`world_hash`, `world_generation`) et rôle typé.
Les rôles sont `producer`, `verifier_a`, `verifier_b`. Aucun dictionnaire
exécutable, schéma arbitraire ou champ d'autorité ne vient du contexte reçu.

`apply(store,binding,input)` attend une génération de base exacte. Il persiste le
contexte et les phases locales `DECLARE_CONTEXT`, `OFFER_DELTA`, `APPLY_DELTA`,
`ACK_STATE` dans la même transaction. L'acquittement décrit l'état appliqué ; il
ne signifie ni décision valide, ni effet autorisé, ni approbation humaine.

Une base périmée persiste `REQUEST_MISSING`, demande une représentation canonique
et renvoie une erreur sans modifier l'état. L'appelant doit lire la base courante
puis effectuer un rebasage explicite. La répétition exacte d'une application déjà
acceptée retourne son état sans ajouter un second acquittement.

L'audience est dérivée de l'incarnation et du rôle. Chaque rôle possède son slot
persistant. Le digest de contenu commun exclut le rôle et l'audience afin que les
trois workers traitent les mêmes données ; chaque lecture contrôle séparément
ces métadonnées et le binding complet. Les générations du document, du binding et
de la base CAS restent distinctes.

L'exécuteur relit `read(store,binding,role)` et utilise son tableau pour construire
le stdin du processus. Une lecture pour un schéma ou une audience divergents
échoue : aucun sens n'est deviné. Un changement de source ou de contexte exige
une nouvelle preuve EVIDENCE avant publication.

Il s'agit d'un profil canonique typé. Le codec dialectal et le common-ground du
protocole JavaScript `genos.synapse/v1` ne sont pas portés intégralement ici ;
l'interopérabilité réseau et les dictionnaires extensibles ne sont pas annoncés.
Les privilèges restent exclusivement ceux du binding natif courant.
