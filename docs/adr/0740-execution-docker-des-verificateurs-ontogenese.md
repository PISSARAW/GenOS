# ADR 0740 — Exécuter les vérificateurs G1 Ontogenèse dans Docker

- **Date** : 2026-10-24
- **Statut** : Accepté
- **Domaine** : Ontogenèse, vérification indépendante, confinement d'exécution
- **Décideurs** : GenOS maintainers
- **Lié à** : [ADR 0646 — Apprentissage qualifié et exécution ETT reprenable](0646-apprentissage-et-execution-ett-reprenables.md), [ADR 0710 — Harnais de restauration morphogénétique](0710-harnais-restauration-morphogenetique.md)

## Contexte

Les oracles de campagne G1 chargent le code candidat JavaScript et Python dans
leur propre processus. L'oracle Rust lance `cargo test` sur l'hôte. Un worktree,
un Job Object Windows et un environnement sans secrets ne confinent ni les
lectures de fichiers, ni les écritures, ni le réseau. La campagne G1 exige une
frontière OS avant tout lancement.

## Décision

Les vérifications G1 déclarent un profil `sandbox.runtime = docker`, une image
locale épinglée par digest SHA-256 et une racine d'oracle séparée du workspace.
Le runner refuse toute autre valeur. Il exige un daemon Docker Linux, utilise
`--pull=never`, désactive le réseau, rend la racine du conteneur et les deux
montages en lecture seule, supprime toutes les capabilities, interdit l'élévation
de privilèges et borne PID, mémoire, CPU, temps et sortie. Seuls les chemins du
workspace et de l'oracle sont montés; aucun environnement applicatif ou secret
n'est transmis au conteneur.

Le reçu de vérification reprend le digest d'image, le mode réseau, les droits des
montages et le runtime. La validation du reçu exige ces champs pour chaque check
Docker et lie l'image attendue au digest de la configuration. L'oracle reste
hors du workspace et les commandes de mission qui ne déclarent pas ce profil
gardent le comportement historique; elles ne sont pas qualifiées pour G1.

Le préparateur G1 refuse de créer une campagne si
`GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE` n'est pas une image locale épinglée par
digest. `--pull=never` rend une image absente bloquante au lieu de la télécharger.

## Conséquences

- Positives : les campagnes G1 ne peuvent plus configurer silencieusement un
  vérificateur hôte; une preuve G1 est liée à l'image et aux restrictions
  demandées au moteur Linux.
- Négatives : il faut provisionner une image vérificateur multi-langage et un
  moteur Docker Linux avant de préparer puis sceller une campagne.
- Cette décision ne qualifie pas l'implémentation Docker elle-même. Un run réel
  sur le daemon Linux avec les trois langages reste requis.
- La disponibilité du moteur est vérifiée à chaque lancement; aucun succès n'est
  simulé si Docker est arrêté ou utilise un runtime Windows.

## Alternatives

- Lancer les oracles avec le Job Object Windows : écarté, car il borne la mémoire
  et termine les descendants sans confiner disque ni réseau.
- Traiter un worktree comme un sandbox : écarté, car il reste accessible avec
  les droits du processus hôte.
- Télécharger automatiquement l'image : écarté, car cela ouvre un accès réseau
  et rend la provenance moins contrôlable pendant la campagne.

## Validation

Le test ciblé du runner vérifie la construction des options Docker et lie la
preuve à l'image, au réseau désactivé et aux montages en lecture seule. Le
contrôle d'exécution réel exige un Docker Linux et une image provisionnée par
digest; ils ne sont pas disponibles sur l'hôte de qualification courant.
