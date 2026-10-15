# ADR 0521 — Attester la provenance des fossiles

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Fossilisation, provenance, confiance backend/CLI
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0003 — Fossilisation stratigraphique

## Contexte

Le backend vérifie le hash de matière minérale et relit l'événement terminal en
base. Le CLI local ne dispose que du fichier exporté : son hash prouve qu'un
contenu n'a pas changé depuis son scellement, mais ne prouve pas que le backend
l'a produit. Un `source_event_hash` non signé n'établit pas cette autorité.

## Décision

Le backend signe en Ed25519 une attestation de version 1 liée à l'identifiant du
fossile, l'identifiant et le hash de l'événement terminal, la lignée, le périmètre
organisation/projet et le hash de matière. La clé privée reste dans la
configuration secrète du backend. L'attestation est persistée avec le fossile et
incluse dans l'artefact et les réponses REST/MCP.

Au point d'entrée de l'excavation locale, le CLI exige cette attestation dès que
le fossile déclare une provenance source. Il sélectionne une clé publique par
`key_id` depuis la configuration de confiance de l'opérateur, indépendante de
l'artefact. Clé inconnue, signature incorrecte, attestation absente ou périmètre
modifié provoquent un refus. Les fossiles historiques sans événement restent
identifiés comme legacy, sans revendication d'authenticité backend.

## Conséquences

### Positives

- Le contrôle d'intégrité local est complété par une preuve d'origine backend.
- La signature lie explicitement l'événement, la lignée, le tenant et le hash.
- La rotation de confiance relève de l'opérateur; l'artefact ne peut pas ajouter
  une clé de confiance.

### Négatives

- Le backend doit être configuré avec une clé privée et le CLI avec les clés
  publiques approuvées; l'absence de ces configurations bloque les fossiles
  nouvellement sourcés.
- Les fossiles historiques non attestés ne peuvent pas être élevés au statut
  authentifié sans preuve émise par une autorité de confiance.

## Alternatives

- Faire confiance à une clé publique ou à un secret transporté dans le fichier :
  rejeté, car un artefact falsifié pourrait s'auto-déclarer digne de confiance.
- Traiter le hash SHA-256 comme preuve d'auteur : rejeté, car il n'authentifie
  aucun producteur.
