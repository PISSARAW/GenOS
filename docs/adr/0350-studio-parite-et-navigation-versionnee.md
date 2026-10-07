# ADR 0350 — Studio : parité et navigation versionnée

- **Statut** : Accepté.
- **Date** : 2026-10-07.
- **Domaine** : Studio, sessions, contrats et qualification.
- **Décideurs** : opérateur et agent de développement.
- **Lié à** : ADR 0348 Studio et programme de parité validé.

## Contexte

Le client modulaire fonctionne mais ses vues restent une console technique.
La session, les routes et les composants métier doivent évoluer sans élargir
l'autorité du navigateur. Le runtime et les services exposent des capacités
de maturités différentes ; leur présence n'est pas une preuve de parité.

## Décision

Conserver les modules natifs et le service statique /studio/. Séparer connexion,
contexte tenant et vues. Un module de routes ne traite que des destinations
et identifiants bornés. Il utilise le fragment et History API ; aucun token,
secret, contenu de fichier ou dossier signé n'entre dans l'URL.

Une route d'objet n'est ouverte qu'après authentification. Les API restent
responsables de l'autorisation et du tenant ; un identifiant URL ne change
jamais automatiquement organisation, projet ou rôle. Les changements de
session annulent les requêtes et effacent tous les détails métier.

Les composants rendent par textContent et DOM natif, jamais par HTML issu
du runtime. Les réponses JSON restent accessibles dans des détails techniques,
mais pas comme représentation métier principale. Les limites (inconnu,
tronqué, simulation, non exécuté) font partie du rendu.

L'interface ne crée ni trial ni effet externe pendant son onboarding. Les
budgets déclaratifs restent déclaratifs jusqu'à une qualification de C19/S07/S08.
La construction visuelle future sera un adaptateur du contrat workflow,
pas un moteur implicite indépendant des contrôles backend.

Les tests navigateur utilisent un serveur HTTP local à port attribué par
l'OS, une base et un workspace temporaires. Ils conservent versions, captures,
refus, erreurs de page et résultats. Chaque sous-point a un commit.

## Conséquences

### Positives

- Aucun changement de chaîne de compilation, d'API métier ou de permission.
- Historique et liens profonds testables séparément.
- Réutilisation incrémentale du client, de la sécurité et des harnais existants.

### Négatives et limites

- Une connexion est requise après rechargement ; la clé reste en mémoire.
- Une route ne rend pas un run reproductible et ne prouve pas sa validité.
- Les routes ne synchronisent pas les buffers ni les acteurs filesystem externes.
- Chaque nouvelle capacité doit avoir ses propres contrats et qualifications.
- La haute disponibilité et les fournisseurs réels ne sont pas prouvés par l'UI.

## Alternatives

- SPA avec nouveau framework : à réévaluer sur besoin mesuré, pas requis ici.
- Jeton en URL ou stockage navigateur : rejeté pour préserver le contrat.
- Frontend pilotant directement le runtime : rejeté, contournerait les gates.

## Références

- [Programme](../06-qualite-preuves/studio-parite-plan.md).
- [Suivi](../06-qualite-preuves/studio-parite-suivi.md).
