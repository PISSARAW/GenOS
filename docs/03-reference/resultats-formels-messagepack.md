# Résultats formels MessagePack

- **Statut** : Implémenté
- **Portée** : contrat Node.js `genos.formal-result/v1`
- **Dernière revue** : 2026-09-19

## 1. Objet

Le contrat de résultat formel transporte une proposition avec les informations
nécessaires à son interprétation, sa reproduction et son audit. Il sépare deux
identités :

- `semanticFingerprint` identifie l'énoncé, ses hypothèses et son domaine ;
- `resultId` identifie le résultat intégral, preuve, provenance et producteur inclus.

La représentation persistée ou échangée est une trame MessagePack binaire. JSON
peut rester une vue d'inspection aux frontières humaines, mais n'est pas la forme
canonique de ce contrat.

Implémentation :
[`formalResultService.js`](../../backend/src/services/formalResultService.js).

## 2. Objet logique

| Champ | Type | Règle |
| --- | --- | --- |
| `contractVersion` | chaîne | Toujours `genos.formal-result/v1` |
| `resultId` | SHA-256 | Empreinte du contenu intégral canonique |
| `canonicalStatement` | chaîne | Non vide, Unicode NFC, espaces normalisés |
| `semanticFingerprint` | SHA-256 | Empreinte de l'énoncé, des hypothèses et du domaine |
| `assumptions` | tableau | Couples `id` et `statement`, triés par identifiant |
| `validityDomain` | objet | Énoncé de domaine et contraintes explicites |
| `dependencies` | tableau | Identifiant, empreinte sémantique et relation de chaque antécédent |
| `status` | énumération | `conjecture`, `tested`, `refuted`, `formalized`, `verified` |
| `evidence` | objet | Preuve, contre-exemple ou artefact reproductible |
| `provenance` | objet | Date, acteur, source, entrées et transformations |
| `producer` | objet | Modèle et version ayant produit le résultat |

Les empreintes ont la forme `sha256:` suivie de 64 chiffres hexadécimaux
minuscules.

## 3. Statuts et preuves

| Statut | Sens | Contrainte particulière |
| --- | --- | --- |
| `conjecture` | Proposition non établie | Une pièce justificative reste obligatoire |
| `tested` | Proposition confrontée à un protocole borné | L'étendue du test doit être portée par l'artefact |
| `refuted` | Proposition invalidée dans son domaine déclaré | `evidence.kind` doit être `counterexample` |
| `formalized` | Proposition exprimée dans un système formel | Ne signifie pas qu'elle est démontrée |
| `verified` | Proposition accompagnée d'une preuve | `evidence.kind` doit être `proof` |

Les types de preuve autorisés sont `proof`, `counterexample` et
`reproducible_artifact`. Un artefact reproductible exige au minimum une commande
et un environnement. Leur présence ne remplace pas la reproduction indépendante
ni les gates de promotion.

## 4. Provenance minimale complète

`provenance` contient obligatoirement :

- `createdAt` : horodatage ISO 8601 ;
- `actor` : identité de l'agent, du service ou de l'opérateur ;
- `source.type`, `source.uri`, `source.digest` ;
- `inputs[]`, chaque entrée portant `id` et `digest` ;
- `transformations[]`, dans leur ordre d'application.

`producer.model` et `producer.version` sont distincts de l'acteur. Un agent peut
appeler plusieurs modèles, et un service déterministe peut déclarer son propre nom
de modèle d'exécution et sa version.

## 5. Encodage binaire

Le type de média est :

```text
application/vnd.genos.formal-result+msgpack
```

Une trame commence par les quatre octets ASCII `GFR1`, suivis d'un tableau
MessagePack positionnel :

```text
[
  wireVersion,
  canonicalStatement,
  semanticFingerprint,
  assumptions,
  validityDomain,
  dependencies,
  statusCode,
  evidence,
  provenance,
  producer,
  resultId
]
```

L'ordre positionnel est un ABI. Un changement incompatible exige une nouvelle
version de trame et une nouvelle signature. Les objets imbriqués libres sont
canonisés par ordre lexical des clés avant calcul des empreintes.

## 6. API Node.js

Le module exporte :

- `createFormalResult(input)` : valide, normalise et calcule les empreintes ;
- `encodeFormalResult(input)` : retourne un `Buffer` MessagePack signé `GFR1` ;
- `decodeFormalResult(frame)` : décode, recalcule et vérifie toutes les empreintes ;
- `CONTRACT_VERSION`, `MEDIA_TYPE`, `STATUSES`, `EVIDENCE_KINDS`.

Exemple minimal :

```js
const {
  createFormalResult,
  encodeFormalResult,
  decodeFormalResult,
} = require('./src/services/formalResultService');

const input = {
  canonicalStatement: 'Le résultat R vaut 42 sous A1.',
  assumptions: [{ id: 'A1', statement: 'L’entrée est un entier positif.' }],
  validityDomain: {
    statement: 'Entiers positifs.',
    constraints: ['n > 0'],
  },
  dependencies: [],
  status: 'tested',
  evidence: {
    kind: 'reproducible_artifact',
    content: { observed: 42 },
    reproduction: { command: 'node verify.mjs', environment: 'node-22' },
  },
  provenance: {
    createdAt: '2026-09-19T10:00:00.000Z',
    actor: 'agent:researcher-1',
    source: {
      type: 'experiment',
      uri: 'genos://experiments/result-42',
      digest: `sha256:${'a'.repeat(64)}`,
    },
    inputs: [],
    transformations: ['execute-verifier'],
  },
  producer: { model: 'model-name', version: 'model-version' },
};

const formal = createFormalResult(input);
const frame = encodeFormalResult(formal);
const verified = decodeFormalResult(frame);
```

Le décodeur rejette notamment une signature invalide, une version inconnue, une
empreinte sémantique divergente, une preuve altérée ou un `resultId` incohérent.

## 7. Adoption

Tout nouveau chemin produisant un résultat scientifique ou épistémique durable
doit construire ce contrat avant persistance ou promotion. Les sorties historiques
ne sont pas converties implicitement : une migration doit reconstruire leur
provenance sans inventer les champs absents. Un résultat historique incomplet doit
rester explicitement incomplet plutôt que recevoir une fausse provenance.

## 8. Validation

Le test
[`test_formal_result_contract.js`](../../backend/tests/test_formal_result_contract.js)
couvre :

- le round-trip MessagePack ;
- la stabilité canonique malgré l'ordre des clés libres ;
- la séparation entre empreinte sémantique et identité intégrale ;
- la détection d'altération ;
- les contraintes statut/preuve et la provenance obligatoire ;
- une comparaison de taille avec la vue JSON sur une fixture représentative.

Exécution :

```bash
node backend/tests/test_formal_result_contract.js
npm --prefix backend run test:migration
```

Cette comparaison de taille ne constitue pas une affirmation générale de gain de
latence. Toute revendication de performance de bout en bout exige un benchmark
représentatif de la charge réelle.

## 9. Voir aussi

- [ADR 0029](../adr/0029-resultat-formel-messagepack.md) — décision et alternatives.
- [Persistance et données](persistance-et-donnees.md) — stockage MessagePack existant.
- [Épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md) — gates de preuve et promotion.
