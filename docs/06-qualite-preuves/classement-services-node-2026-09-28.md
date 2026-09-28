# Phase 1.1 — Classement des services Node

Generateur : `node scripts/ci/inventory_node.js [--json]`
(commits `inventory_lib.js` + `inventory_node.js` par l'auteur concurrent ;
le present point les consomme sans les dupliquer).
Mesure du 2026-09-28 ~05:35 : **1822 services**, atteignables **1313**,
non atteignables **509**, sans import litteral **312**.
44 routes (44 montees, 0 orpheline), 51 programmes `backend/bin`,
39 services `daemon`, 41 fichiers `*registry*`, catalogues MCP 36/36
sans ecart de noms. La derive +3 services en ~15 min vient de l'auteur
concurrent ; l'atteignabilite statique reste a 1313.

## Taxonomie opposable (un statut par service)

- `actif` : parcours de production observable (entree → effet → preuve).
- `experimental` : branche-runtime mais sans parcours nominal + refus + recu.
- `bibliotheque` : passif, importable, sans obligation d'etre cable ;
  suppression interdite sans preuve d'absence d'usage.
- `obsolete` : remplace, avec chemin de migration et date de retrait.
- `a_classer` : defaut. Exige responsable + raison + echeance.
  Les **312 sans import litteral** restent `a_classer` en priorite :
  imports dynamiques, enregistrements, routes, jobs, CLI et outils MCP
  doivent etre examines avant tout cablage ou retrait.

## Fiche minimale par service

Entree de production, proprietaire, capacites requises, contrat,
test nominal, test de refus, preuve observable (test + recu versionne).
Sources de depart : `registre-services.md` (1814 annonces),
`inventaire-atteignabilite-services.md` (1814/1310/504/308),
scanner courant (1822/1313/509/312), `registres-dynamiques.md`
(import n'est pas cablage).

## Regle import / cablage

Un import litteral prouve l'atteignabilite statique, pas le cablage
runtime. La presence dans un registre, un catalogue ou une doc ne prouve
ni handler ni lease ni invocation. Tout passage `a_classer → actif`
exige le parcours Phase 3 + recu ; tout passage vers `obsolete` exige
preuve d'absence d'usage (pas de suppression opportuniste).

## Sortie du point

Generateur reproductible + taxonomie + fiches exigees.
L'enumeration exhaustive des 1822 fiches est le chantier Phase 1
(en cours) ; ce point fige la methode, pas les 1822 statuts.
Prochains points : inventaires Rust/MCP/integrations (scripts
`inventory_rust.js`, `inventory_mcp.js`), puis matrice `Sense → Reuse`.
