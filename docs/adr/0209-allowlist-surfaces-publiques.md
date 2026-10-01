# ADR 0209 — Fermer les surfaces publiques par allowlist

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : API, authentification, sécurité
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0028

## Contexte

Le middleware d'authentification exemptait des préfixes entiers (`/api/auth/`,
`/api/sso/` et `/api/security/csrf`). Une nouvelle route montée sous ces préfixes
devenait ainsi publique par défaut, même si ses contrôles de permission ne
l'exigeaient pas. La lecture de session était notamment atteignable sans
identifiant.

## Décision

Les seules requêtes anonymes autorisées sont celles explicitement requises pour
les probes de santé, l'authentification, la découverte et les retours de protocole
SSO, ainsi que l'émission d'un jeton CSRF. L'allowlist associe chaque chemin à sa
méthode HTTP et accepte uniquement les formes de routes SSO comportant un seul
identifiant de fournisseur. Toute autre requête passe par l'authentification
globale; les précontrôles `OPTIONS` restent disponibles pour CORS et ne donnent
pas accès au handler métier.

## Conséquences

### Positives

- Les routes ajoutées sous les préfixes d'authentification et SSO sont protégées
  par défaut.
- La session, l'administration des clés et la configuration SSO ne sont plus
  accessibles anonymement.
- Un test de contrat maintient les routes publiques permises et vérifie le rejet
  des routes voisines et des méthodes inattendues.

### Négatives

- Toute nouvelle route de bootstrap anonyme doit être ajoutée explicitement à
  l'allowlist et au test de contrat.
- Les callbacks SSO restent publics par nécessité protocolaire et leur sécurité
  dépend de la validation de state, nonce, signature et réponse déjà appliquée
  par leurs handlers.

## Alternatives

- Conserver les préfixes publics et compter sur les protections de chaque route :
  rejeté, car une route oubliant son middleware devient publiquement accessible.
- Supprimer les exemptions SSO : rejeté, car un retour OIDC ou SAML doit pouvoir
  établir une session avant qu'un identifiant soit disponible.
