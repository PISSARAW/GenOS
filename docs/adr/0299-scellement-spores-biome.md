# ADR 0299 - Scellement des spores Biome

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : cryptobiose, confidentialité, restauration
- **Décideurs** : équipe GenOS
- **Lié à** : [Cryptobiose et fossilisation](../01-concepts/fossilisation.md)

## Contexte

Le gel d'un individu Biome conservait son état MessagePack en base64 dans la
population. Cette représentation ne protégeait ni sa confidentialité ni son
attribution. La germination JavaScript ne vérifiait pas l'empreinte du contenu.
Le magasin Rust retirait une spore avant de savoir si le dégel pouvait réussir.

## Décision

Le chemin de gel des populations Biome chiffre désormais l'individu et ses
paramètres de vitrification avec AES-256-GCM. Une clé dérivée par scrypt utilise
`GENOS_SECRET_KEY`, un sel aléatoire propre à la spore et un préfixe de domaine.
Un nonce aléatoire indépendant des seeds de simulation accompagne chaque objet.
Le MessagePack existant demeure le format de charge utile.

Les données associées authentifiées encodent dans un ordre fixe le domaine
`biome`, l'identifiant de population, l'identifiant d'individu, la version
d'artefact et la version de schéma. Le contexte attendu vient de la population
et de l'identifiant demandés par l'appelant, non de l'enveloppe stockée.
Le dégel exige aussi une fonction `authorizeSporeRead` passée dans les options
internes du runtime. Son absence refuse l'accès. L'appelant de confiance doit
réévaluer l'autorité à chaque dégel ; une relation ou une topologie ne vaut pas
autorisation. L'échec conserve la spore dans la population. Une fusion de
populations refuse les spores de la source tant qu'une procédure autorisée de
nouveau scellement pour la destination n'existe pas.

Les anciennes spores contenant `rawBlob` ne sont pas déchiffrées implicitement
par ce chemin. Leur migration demande une opération explicite dans un contexte
de confiance. Les fonctions générales `vitrifyState` et `germinateSpore` restent
disponibles pour leurs autres usages, avec vérification de SHA-256 avant lecture.
Le magasin Rust vérifie aussi SHA-256 et ne retire l'agent qu'après succès ;
il ne chiffre pas encore ses données en mémoire.

## Conséquences

### Positives

- Une copie de la capsule ne révèle pas l'état sans la clé configurée.
- Une permutation de population ou d'individu et une modification du contenu
  invalident l'authentification.
- Un refus d'accès ou une erreur de germination n'efface pas la spore.

### Négatives et limites

- Le dégel requiert `GENOS_SECRET_KEY` et une politique d'autorisation fournie
  par le runtime de confiance. Aucun fournisseur Vault binaire ni rotation de
  clé n'est implémenté dans cette étape.
- La confidentialité des autres mémoires, forks, replays et topologies n'est pas
  modifiée ici. Une politique de vues mémoire reste nécessaire.
- Le chiffrement ne prouve pas la fraîcheur. Détecter le rejeu d'une ancienne
  capsule exige un registre de versions fiable et persistant.
- La persistance, les sauvegardes et la publication expurgée des capsules
  relèvent de flux distincts encore à définir.

## Alternatives

- Réutiliser directement le coffre de secrets : écarté pour les charges binaires,
  car son interface actuelle convertit les valeurs en chaînes.
- Continuer avec base64 et SHA-256 : écarté, car l'empreinte n'apporte aucune
  confidentialité ni authentification de l'identité.
