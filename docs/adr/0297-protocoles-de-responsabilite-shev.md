# ADR 0297 — Protocoles de responsabilité, de surveillance et de transfert SHEV

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : SHEV, Ontogenèse, GVX, évaluation
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0295](0295-responsabilite-persistante-shev.md)

## Contexte

La première boucle SHEV conserve un mandat et transforme certains constats
en tâches. Elle ne permet ni révision authentifiée, ni approbation bornée des
initiatives de risque, ni suivi après l'application. Le résultat local d'un
projet ne doit pas être pris pour un progrès transférable de l'agent.

## Décision

1. La délégation peut enregistrer une clé publique Ed25519. Les révisions de
   mandat et de stade, les approbations de risque et les reprises métier
   utilisent des signatures liées à l'opération, au sujet, à la version, à
   un nonce et à une expiration. Une délégation héritée sans clé ne peut pas
   acquérir cette autorité par simple appel de service.
2. Une révision conserve tous les critères d'acceptation et toutes les
   attentes existantes. Le runtime n'infère jamais un mandat moins strict à
   partir d'un résultat favorable.
3. Une initiative de risque ou d'opportunité attend une approbation signée
   avec budget, condition d'arrêt et alternative. Le dispatch refuse les
   enveloppes absentes ou expirées et borne le budget transmis au worker.
4. Un effet projet crée une surveillance persistante. Les régressions
   produisent un reçu de contrôle, puis une proposition de reprise métier
   approuvée séparément. Une tentative externe interrompue ne se rejoue pas
   automatiquement.
5. La perception et la vérification concrètes couvrent un pipeline de données
   et un contrat JSON applicatif. Un reçu de transfert GVX sur contextes
   distincts des essais est stocké à part du résultat du projet.
6. Les scores qualitatifs exigent une calibration sur références et gardent
   les désaccords. Une comparaison longitudinale doit être préenregistrée,
   appariée et liée aux reçus de surveillance ; elle ne déclare pas une cause.

## Conséquences

La migration 102 ajoute les journaux d'autorisation, d'approbation, de
surveillance, de reprise, de progrès de l'agent et d'évaluation. Les
anciennes responsabilités restent exécutables pour leurs permissions
initiales mais ne deviennent pas des autorités de révision.

La signature contrôle l'identité de la décision, pas la véracité d'une
observation ni la compétence d'un vérificateur. Les adaptateurs métiers
doivent fournir des preuves indépendantes et une procédure de réconciliation
des effets externes. Les comparaisons et tests synthétiques ne valent pas
qualification sur un terrain longitudinal réel.
