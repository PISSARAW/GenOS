# ADR 0704 — Qualification signée et révocable de morphogenèse P3

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Morphogenèse, qualification, autorité, révocation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0616, ADR 0624, ADR 0625, ADR 0700, ADR 0702

## Contexte

P2 lie le plan, le registre de variants et le port topologique, puis exige cinq
dimensions déclarées `verified` avec des références de preuve. Cette frontière
reste statique : elle ne prouve ni l'autorité qui a admis ces références, ni leur
fraîcheur, ni la continuité entre la qualification et le port exécuté. Une
contre-preuve ne peut pas non plus retirer une admission déjà distribuée.

L'inventaire P3 confirme qu'aucun adaptateur des huit topologies ne restaure encore
son état spécialisé. Le service commun de snapshots ne propose qu'un prévol
`verify-only` avec `restorable: false`. Activer un variant de production à partir de
ces seuls manifests contredirait donc les gates P1 et P2.

## Décision

P3 ajoute une qualification éphémère signée qui enveloppe l'admission P2. Son corps
lie :

1. la topologie, le variant demandé et son identifiant canonique ;
2. le digest courant des cinq qualifications et leurs références de preuve ;
3. le digest du descripteur du `TopologyRuntimePort` ;
4. l'autorité émettrice, l'instant d'émission et une expiration limitée à quinze
   minutes ;
5. `authorizesPromotion: false`.

L'exécution P3 relance l'admission P2, vérifie l'intégrité et la signature Ed25519
du lease, sa fenêtre temporelle, tous ses bindings, puis un journal de révocation
signé et chaîné. Une dérive du variant, des preuves ou du port, une expiration, une
clé non approuvée, une chaîne invalide ou une révocation bloque avant `observe`.
Après ce prévol, P3 délègue au coordinateur P1 par l'admission P2.

Le registre de confiance et le journal sont injectés explicitement. Une absence ou
un format invalide échoue en fermé. La suite de tests utilise un variant contrôlé ;
aucun variant des huit catalogues actuels n'obtient de lease de production.

## Conséquences

### Positives

- Une ancienne admission ne survit pas silencieusement à une dérive du runtime ou
  des preuves.
- L'autorité de qualification est authentifiée et peut être retirée du registre.
- Une contre-preuve peut révoquer un lease précis sans supprimer son histoire.
- Tous les refus interviennent avant la première phase mutante ou observable du
  cycle transactionnel.
- La réussite reste une preuve d'exécution, jamais une autorité de promotion.

### Négatives et limites

- P3 qualifie le protocole commun, pas un restaurateur spécialisé de production.
- Le journal chaîné détecte l'altération, le réordonnancement et la falsification,
  mais son head n'est pas encore ancré dans un stockage durable anti-rollback.
- La distribution multi-hôte du registre de confiance et des révocations reste à
  implémenter et qualifier.
- Une signature authentifie l'émetteur du lease ; elle ne transforme pas les
  références sous-jacentes en preuves vraies.

## Alternatives écartées

- Activer Métapopulation ou Holobionte sur leur prévol snapshot : rejeté, car ce
  prévol annonce explicitement une restauration non disponible.
- Accepter une admission P2 sans durée de vie : rejeté, car elle peut devenir
  obsolète après une dérive du port ou des preuves.
- Utiliser un booléen de révocation non signé : rejeté, car il serait forgeable.
- Autoriser la promotion avec le lease : rejeté, car qualification technique et
  bénéfice empirique sont des décisions distinctes.

## Vérifications associées

- `node backend/tests/test_morphogenesis_p3_qualification.js`
- `node backend/tests/test_morphogenesis_p2_admission.js`
- `node backend/tests/test_morphogenesis_p1_transaction.js`
- `python scripts/ci/check_code_quality.py`
