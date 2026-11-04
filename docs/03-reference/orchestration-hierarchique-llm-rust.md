# Échanges et preuves d'une délégation hiérarchique Rust

Le profil `--executor rust --agentic-config` peut admettre une
arborescence de rôles. Voir l'[ADR 0787](../adr/0787-hierarchie-et-delegation-recursive-llm-rust.md)
pour les bornes et les choix de compatibilité.

## Exemple d'arbre admis

```json
{
  "coordinator": "root",
  "max_delegations": 4,
  "hierarchy": {
    "parents": {
      "manager": "root",
      "sibling": "root",
      "leaf": "manager",
      "spare": "manager"
    },
    "max_depth": 3,
    "max_children": 2
  }
}
```

Cet objet est la valeur `orchestration` d'une configuration agentique,
pas une configuration complète. Les cinq rôles doivent déjà figurer dans
`agents`, avec leurs instructions et outils propres. La racine reste le
dernier rôle configuré. Les dépendances statiques `depends_on` sont vides
dans ce profil.

Un chemin exécuté peut être :
`root/0 → manager/0 → leaf/0..1 → manager/1 → root/1`.
Les slots `sibling` et `spare` peuvent rester dormants. L'outil
`delegate_task` admet une tâche de 4096 octets UTF-8 au maximum et un
enfant direct autorisé ; il n'exécute pas le modèle enfant dans sa
transaction locale.

## Ce que reçoit un intermédiaire

La vue conservée dans SYNAPSE contient sa propre affectation entrante,
le reçu de livraison de cette tâche et les retours de ses enfants directs.
La partie `model` transmet la tâche et les textes réellement reçus.
Les preuves détaillées restent liées au contexte appliqué et au hash de
la requête native.

Pour `manager/1`, une affectation émise à `manager/0` devient visible.
Une affectation de `root/0` ou de `sibling/0` ne fait pas partie de ce
préfixe sortant. Les futures affectations du manager n'altèrent pas son
ancien contexte au tour zéro. Le catalogue `available_workers` respecte
le même préfixe local, même si le slot est affecté plus tard.

## Livraisons physiques

Les tâches sont conservées dans
`protocol_agentic_task_deliveries` ; les retours dans
`protocol_agentic_delegation_returns`. Les bytes sont des objets
immuables de `protocol_gqwf_objects`, dans des espaces distincts par
binding, émetteur et destinataire. Les retours réutilisent les paquets
`protocol_agentic_deliveries`.

Le champ historique `coordinator_id` des reçus désigne le parent
effectif de l'affectation ; un retour de feuille vers son manager ne
désigne pas implicitement la racine. L'identité, la copie, les hashes,
les index et les événements originaux sont contrôlés ensemble.

Un parent possédant `read_artifact` peut lire un artefact d'un enfant
direct seulement après le retour requis dans son propre préfixe.
Le droit ne s'étend pas aux petits-enfants ou aux branches voisines.
Un intermédiaire peut produire son propre artefact dérivé sous son
propre droit admis ; la provenance antérieure reste dans la clôture.

## Fenêtre et budget de temps H2

Le profil hiérarchique Rust peut demander explicitement jusqu'à
600 000 ms de fenêtre de mission. Cette possibilité n'est admise
qu'après lecture et validation de la configuration réelle contenant
`orchestration.hierarchy`. Un argument CLI plus grand que 180 000 ms
n'autorise pas à lui seul une telle fenêtre. Les profils statique,
dynamique plat et les autres routes restent soumis à leur borne de
180 000 ms.

Exemple de demande, avec une configuration hiérarchique complète déjà
validée :

```text
genos run "..." --executor rust --agentic-config hierarchy.json --timeout-ms 600000
```

La configuration peut déclarer `limits.wall_ms: 570000`, avec une
réserve protégée de 5 % identique au mécanisme existant.
`limits.wall_ms` mesure le cumul des temps observés ; la fenêtre
`timeout_ms` borne la validité de la mission. Ces deux valeurs ne
mesurent pas la même chose. Le budget cumulé doit rester inférieur ou
égal à la fenêtre admise.

Chaque requête HTTP garde une borne maximale de 180 000 ms. Son contexte
et son intention restent limités par le budget disponible, la borne de
tour et le bail courant. Une fenêtre plus longue n'autorise aucun
recrédit, retry automatique ou élargissement des permissions.

Cette extension H2 est une nouvelle condition d'admission, pas une
prolongation d'un run H1. Les quatre essais H1 et leurs expositions
restent inchangés. Ils ne constituent pas une qualification sous H2.
La nouvelle fenêtre peut éviter une limite trop courte dans certains
parcours, mais ne garantit ni réponse du fournisseur ni contrat final
satisfait.

## Clôture et ambiguïtés

EVIDENCE couvre toute l'arborescence effectivement activée et signale
les slots inutilisés. Supprimer une affectation et son événement MORPH
ne masque pas son vrai reçu d'outil accepté : la couverture inverse des
appels natifs l'interdit.

CONTINUITY conserve le refus tant qu'une tâche ou un retour requis
reste en attente. Les expositions inconnues ne deviennent jamais des
consommations nulles et ne recréent pas un permis HTTP. Un modèle connu,
ses outils locaux et sa publication peuvent être réconciliés à partir
des reçus persistés, sous les gardes courantes.

La publication finale reste une vérification de contrat d'artefact sur
un CAS local. Elle n'atteste ni vérité de la prose, ni droit de déployer,
ni calcul simultané du fournisseur. Les deux vérifications de contrat
s'exécutent sur le même hôte et ne constituent pas deux confirmations
statistiquement indépendantes.

## Vérification prévue

Les tests ciblés couvrent la composition tâche/retours, les préfixes
locaux, l'accès non transitif aux artefacts, la corruption des copies
destinataires, la transplantation de reçus rehashés et l'effacement d'une
affectation malgré son appel natif. Une injection SQLite après la mise à
jour de tête doit annuler ensemble la publication, la tête, OMEGA et le
statut de run ; le rejeu exact conserve les coûts et évite tout nouvel HTTP.

Les résultats de validation et d'essai réel sont consignés dans la
qualification de livraison ; ce document décrit les contrôles et ne
certifie pas une exécution en cours.
