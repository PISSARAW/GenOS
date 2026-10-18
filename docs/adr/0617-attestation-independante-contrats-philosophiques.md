# ADR 0617 — Attestation indépendante des contrats philosophiques

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : philosophie opérationnelle, preuve, maturité, indépendance
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0609](0609-missions-representatives-philosophie.md), [ADR 0615](0615-comparaisons-organisations-philosophiques.md)

## Contexte

Les scénarios unitaires, missions représentatives et comparaisons de quatre
organisations sont rejouables, mais ils restent produits par le même runtime.
Un booléen d'indépendance fourni par l'appelant ne constitue pas une preuve et
ne doit pas suffire au niveau de maturité `validated`.

## Décision

Produire un reçu runtime par contrat seulement lorsqu'il appartient à l'une des
quatre missions représentatives. Ce reçu encapsule et rejoue le reçu de mission
et le reçu de comparaison organisationnelle, tous deux liés à l'empreinte du
contrat.

Admettre ensuite une attestation uniquement si un vérificateur du registre de
confiance signe par HMAC l'identifiant du reçu runtime, son empreinte de preuve,
les obligations couvertes et les types de reçus. La politique d'indépendance
existante exige un acteur et un espace d'exécution distincts du producteur, avec
une distance minimale de trois dimensions. Une auto-attestation, une signature
altérée, un reçu non rejouable ou un vérificateur non reconnu est refusé.

Les trois reçus vérifiés (`scenario`, `runtime`, `independent`) satisfont la
barrière de preuve du niveau `validated`. Le résultat conserve toutefois
`promotionEligible: false` : il qualifie la maturité du logiciel audité, sans
accorder d'autorité runtime ni établir la vérité externe d'une thèse.

## Conséquences

- Douze contrats disposent d'une voie de validation bornée et indépendante.
- Les 408 autres contrats restent bloqués faute de mission représentative.
- La confiance provient du registre interne et non d'une liste fournie par l'appelant.
- Les faits externes, workers distribués et topologies réelles restent non vérifiés.
- La rotation ou l'indisponibilité des clés rend l'attestation fail-closed.

## Alternatives

- Accepter `independentValidation: true` : rejeté, car auto-déclaratif.
- Signer automatiquement dans le routeur : rejeté, car le producteur deviendrait son propre vérificateur.
- Déclarer les 420 contrats validés : rejeté, car seuls douze sont couverts par les missions composées.
