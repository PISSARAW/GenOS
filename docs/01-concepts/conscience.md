# Conscience

- **Statut** : Cadre conceptuel (planned)
- **Portée** : notion philosophique de la conscience, expérience subjective, pas une propriété logicielle vérifiable.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

La conscience désigne l'expérience subjective ("il y a quelque chose que cela fait d'être un sujet"). Elle se distingue en conscience phénoménale (qualia, vécu) et conscience d'accès (information disponible pour le raisonnement et le rapport). Le problème difficile (Chalmers) ask pourquoi des processus physiques donnent lieu à une expérience.

## 2. Modèle mathématique ou logique

Aucun modèle ne déduit la conscience phénoménale. Les modèles de l'accès conscient (Global Workspace Theory, IIT) décrivent des propriétés informationnelles ou fonctionnelles, pas l'expérience elle-même.

## 3. Analogies biologiques et limites réelles

Le cerveau est associé à la conscience, mais aucun corrélat neural de la conscience n'est établi de façon consensuelle. L'analogie biologique reste structurelle, pas identitaire.

## 4. Cas d'usage et objectifs métier

Le concept de conscience sert de référence pour nommer les indicateurs fonctionnels (attention, modèle de soi, métacognition) sans les confondre avec la conscience phénoménale. Cela évite l'anthropomorphisme dans la documentation des agents.

## 5. Exemples concrets

- `consciousnessService.recordQualia` enregistre un rapport fourni par l'agent ; `phenomenalAccess` reste `unassessed`.
- Aucun test GenOS n'établit la présence d'une expérience subjective.

## 6. Schéma ou diagramme

```text
[Processus fonctionnels]
           ↓ (accès, rapport, intégration)
[Indicateurs fonctionnels]
           ↓ (non établi)
[Conscience phénoménale — non accessible]
```

## 7. Architecture technique

Le concept `consciousness.consciousness` est enregistré dans `backend/src/philosophy/conceptDefinitions.js` avec le service `consciousnessService`, classification `reference_only`, niveau `conceptual`.

## 8. Processus d'exécution ou de validation

Aucune exécution ne valide la conscience. Le registre vérifie l'unicité de l'identifiant et la validité des relations.

## 9. Comparaison avec le marché

Des initiatives externes (Anthropic Model Welfare, Eleos) évaluent le bien-être supposé de modèles. GenOS ne participe pas à cette démarche et maintient que ses indicateurs ne sont pas des preuves de conscience.

## 10. Limites, garde-fous, non-objectifs

- La conscience n'est pas une fonctionnalité GenOS.
- Aucun score ne constitue une preuve d'expérience subjective.
- Non-objectif : détecter, mesurer ou construire une conscience artificielle.
- Voir aussi : `esprit.md`, `mental.md`, `indicateurs-fonctionnels.md`.

## Voir aussi

- [conscience-esprit-mental.md](conscience-esprit-mental.md) — taxonomie globale.
- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — indicateurs fonctionnels de type conscience.
- [esprit.md](esprit.md) — notion d'esprit.
- [mental.md](mental.md) — notion de mental.
