# ADR 0742 — Déploiement de l'API GCI sur un VPS partagé

- **Statut :** Proposé pour le pilote
- **Date :** 2026-10-24
- **Domaine :** Déploiement, API, sécurité réseau
- **Décideurs :** Équipe GenOS
- **Lié à :** ADR 0345 — GenOS Capability Inheritance (GCI)

## Contexte

GenOSWork est le seul site actuellement annoncé en ligne, tandis que le catalogue GCI exige une API GenOS authentifiée. Le VPS existant utilise Caddy et systemd. Aucun hôte public d'API GenOS n'est configuré; le nom `api.genos.work` n'a pas de DNS au moment de la rédaction. Le relais GenOSWork permet HTTP sur loopback, ce qui évite de rendre l'API publique lorsque les deux services partagent l'hôte.

## Décision

Pour le pilote, préparer le backend GenOS comme service systemd séparé sur le même VPS que GenOSWork. Le backend écoute uniquement sur `127.0.0.1:4000` et conserve SQLite sous `/var/lib/genos`. GenOSWork appelle l'API directement sur cette interface loopback et conserve le jeton `gci:read` dans son propre mécanisme de secrets serveur. Caddy n'expose donc pas le backend GenOS au public. Si les services sont séparés ultérieurement, une origine HTTPS et un sous-domaine API pourront être ajoutés avec la configuration Caddy fournie.

Ce choix est une configuration cible, pas un constat de déploiement. Le DNS, le service, les secrets, le tenant, le projet et les exports doivent être provisionnés par les opérateurs habilités avant le pilote en production.

## Conséquences

### Positives

- Le pilote réutilise le VPS et les services système déjà présents, sans attendre un nouvel enregistrement DNS.
- Le port du backend reste privé; l'API GCI n'est pas publiée directement sur Internet.
- GenOS reste la source de vérité des exports, des permissions et des projets.

### Négatives

- Le backend GenOS et GenOSWork partagent les ressources et le domaine de panne du VPS.
- L'opérateur doit configurer la persistance SQLite, les sauvegardes et deux environnements de secrets distincts.
- Le VPS doit disposer des ressources et dépendances natives requises par le backend GenOS.

## Alternatives

- Déployer GenOS sur un VPS ou service séparé : meilleure isolation, mais ajoute une infrastructure avant la qualification du pilote.
- Exposer directement le port HTTP du backend : rejeté, car cela contourne le point d'entrée TLS Caddy et agrandit inutilement la surface réseau.
- Construire le catalogue directement dans GenOSWork : rejeté, car les capacités, l'autorité et les révocations doivent rester dans GenOS.
