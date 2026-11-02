# ADR 0767 — Mesures AGOW depuis une acceptation native vérifiée

- **Statut** : Accepté pour le domaine natif borné `subset_sum`
- **Date** : 2026-11-02
- **Domaine** : AGOW, workers natifs, vérification métier et preuves
- **Lié à** : [ADR 0766](0766-observation-mission-agow.md)

## Contexte

Le journal AGOW distingue les déclarations terminales des mesures vérifiées, mais
son démonstrateur local ne passe pas par les autorités d'une mission native.
Le runtime dispose déjà de reçus biologiques et d'une acceptation scellée produite
par deux algorithmes de vérification dans deux processus distincts. Les workers
déterministes ne passent pas par l'ingress du superviseur de processus.

## Décision

Déclarer avant exécution le contrat `genos.agow.native-subset-outcome/v1` dans la
liaison AGOW des missions natives `subset_sum` prises en charge. Résoudre le
vérificateur standard depuis ce contrat persistant, en donnant la priorité au
vérificateur hôte déjà enregistré pour la connexion/agent. Aucune inscription
de callback par mission n'est conservée en mémoire. Le contrat de mesure
participe au hash immuable de la liaison.

Après l'application des contrôles d'exécution et de l'événement natif, rechercher
la fin canonique persistée. Vérifier l'identité agent/mission/run, le statut
`completed`, l'absence de guardrail, le reçu biologique, le budget et la chaîne
d'observations appliquées. Relire ensuite l'acceptation native scellée et revalider
la preuve de clôture, ses sources et ses deux vérificateurs indépendants.

Pour ce domaine, la mesure binaire est la satisfaction des postconditions
`subset_sum` enregistrées : perte 0 et progression 1 uniquement après ces
vérifications. Un refus, un résultat inconnu ou une preuve absente ne constitue
pas une mesure de perte 1 : le journal reste en attente. Les autres métriques
restent inconnues (`null`). Les références incluent attestation, acceptation et
nonces des vérificateurs.

Le raccord ne modifie ni la décision de clôture native, ni les leases, ni les
conditions d'admission ou de promotion. L'observation AGOW ne déclenche aucun
crédit supplémentaire ni changement de politique ou de topologie.

## Conséquences

- Un parcours natif réel peut produire une observation AGOW sans callback simulé.
- L'autorité métier reste celle des vérificateurs et du journal natif existants.
- Le statut `completed` et un booléen `verified` seuls restent insuffisants.
- Les autres domaines, les missions LLM et le superviseur de processus demandent
  leurs propres raccords ; le périmètre n'est pas généralisé implicitement.
- La relecture est soumise aux garanties et limites de fraîcheur des preuves
  natives. Elle n'affirme aucune supériorité ou calibration statistique d'AGOW.

## Alternatives

- Lire le seul reçu biologique : rejeté, sans recoupement de l'acceptation scellée.
- Utiliser le payload du worker comme résultat : rejeté, autorité insuffisante.
- Modifier le gate natif pour satisfaire l'observation : rejeté ; le raccord vient
  après les gates existants et ne peut pas les assouplir.

## Vérification

`node backend/tests/test_agow_native_mission.js` provisionne un environnement
isolé, délègue réellement un calcul natif et contrôle les refus de substitution,
de mission étrangère, de contrat de métrique étranger et de guardrail.
Il conserve les artefacts sous `.genos-agent-worlds/agow-native-mission/`.
