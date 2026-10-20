# 01 — Concepts et fondations

Socle conceptuel de GenOS : biologie computationnelle, runtime, génome, mémoire,
épistémologie, biomimétisme spécialisé et nosologie.

Ces fiches suivent le canevas en 10 sections décrit dans [../CONVENTIONS.md](../CONVENTIONS.md).
La distinction entre **implémenté**, **partiel** et **cadre conceptuel** y est explicite.

## Fondations et runtime

- [inventaire-canonique-actuel.md](inventaire-canonique-actuel.md) — état consolidé des 23 sections, registres courants, maturité et limites de preuve.
- [biologie-computationnelle.md](biologie-computationnelle.md) — biomimétique GenOS, embryogenèse, HOX, budgets.
- [genome-et-epigenetique.md](genome-et-epigenetique.md) — génome, chromatine, mutation, stabilité.
- [stabilite-genomique.md](stabilite-genomique.md) — taux de mutation, anomalies, seuils Stable / Compromised / Critical.
- [runtime-agentique.md](runtime-agentique.md) — runtime agentique, états, garde-fous.
- [ontogenese.md](ontogenese.md) — orchestrateur résident de projet, missions bornées et vérifiées.
- [gvx.md](gvx.md) — développement vérifié des agents : signaux, reçus indépendants, plasticité et limites de maturité.
- [continuite-mission.md](continuite-mission.md) — organisme de mission, homéostasie cible, six systèmes de survie (régénération, immunité, dormance, apoptose contrôlée).
- [gqwf.md](gqwf.md) — système de fichiers logique adressé par contenu : racines, vues, baux, catalogue, invariants, architecture et limites ; dossier complété par l'[orchestration](../02-orchestration/gqwf-v2.md), la [référence runtime](../03-reference/runtime-gqwf.md), le [runbook](../04-exploitation/gqwf.md) et la [qualification](../06-qualite-preuves/qualification-gqwf-2026-10-20.md).
- [epistemologie-et-evidence.md](epistemologie-et-evidence.md) — preuves, croyance, succès ≠ vérité.
- [endogenous-thought-test.md](endogenous-thought-test.md) — protocole ETT v1 : détection, question falsifiable, runner borné, vérification indépendante, apprentissage d'épisode et boucle multicycle ; dossier complété par [l'orchestration](../02-orchestration/pensee-endogene-bornee.md), la [référence runtime](../03-reference/runtime-pensee-endogene.md), le [runbook](../04-exploitation/pensee-endogene.md) et la [qualification](../06-qualite-preuves/qualification-pensee-endogene-2026-10-20.md).
- [savoir-et-epistemologie.md](savoir-et-epistemologie.md) — savoir, croyance, Gettier, inférence, vérité et épistémologie sociale.
- [instinct.md](instinct.md) — circuits innés, Patrons d'Action Fixes, modulation hormonale.
- [agent-dna-runtime.md](agent-dna-runtime.md) — format binaire AgentDNA et opérations.
- [speciation-graft-autonome.md](speciation-graft-autonome.md) — flux autonome complet : identification du besoin → speciate/graft → évaluation → promotion → déploiement.
- [evolution-gouvernee-agent.md](evolution-gouvernee-agent.md) — hypothèses de logique/scaffold sous constitution scellée, holdout indépendant, autorisation séparée et rollback reçu.
- [physique-computationnelle.md](physique-computationnelle.md) — mesures du workspace, contexte, imports, couverture et calibration persistante par mission dans la boucle Rust.
- [imagination-et-simulation.md](imagination-et-simulation.md) — recombinaison de fragments, simulation interne, contrôle et preuve.
- [conscience-esprit-mental.md](conscience-esprit-mental.md) — taxonomie de la conscience, de l'esprit et du mental.
- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — suivi des indicateurs fonctionnels de type conscience : table implémentation/limite, doctrine best-effort/borné/avis-seulement.
- [esprit.md](esprit.md) — notion d'esprit, pas d'implémentation comme substance.
- [mental.md](mental.md) — ensemble des états et processus mentaux, pas une fonctionnalité GenOS.
- [conscience.md](conscience.md) — conscience phénoménale, pas une propriété logicielle vérifiable.
- [conscience-operationnelle.md](conscience-operationnelle.md) — régulation cognitive (dissonance, budget, Eurêka, apoptose).
- [conscience-fonctionnelle.md](conscience-fonctionnelle.md) — indicateurs fonctionnels type conscience (attention, modèle de soi, métacognition).
- [attention.md](attention.md) — fovéation, active sensing, bancs causaux et sondes.
- [perception.md](perception.md) — bridge perception-mémoire, observation canonique.
- [interoception.md](interoception.md) — signaux homéostatiques internes et planificateur allostatique.
- [reflexion.md](reflexion.md) — auto-surveillance de la confiance et des erreurs.
- [metacognition.md](metacognition.md) — ECE, Brier, AUC type-2, surconfiance sur l'historique d'attributions.
- [calibration.md](calibration.md) — mise à jour lissée de la confiance, ECE, Brier.
- [etats-de-conscience.md](etats-de-conscience.md) — niveaux fonctionnels, pas états de conscience phénoménale.
- [limites-metrique-experience.md](limites-metrique-experience.md) — séparation score fonctionnel ≠ expérience subjective.
- [adaptive-epistemic-immune-system.md](adaptive-epistemic-immune-system.md) — système immunitaire épistémique adaptatif (antigène, immunité innée/adaptative, sélection clonale, mémoire, inflammation, biocénose, métapopulation, stigmergie, holobionte, challenge). **v2.1 : FormalResult-first, receipts bindés, gate injectée, `npm run test:aeis` vert.**
- [organes-vitaux-agents.md](organes-vitaux-agents.md) — systèmes 6-10 : sensorium, métabolisme, résilience, développement, symbiontes procéduraux ; boucle morphogénétique unifiée.
- [ecosysteme-agentique.md](ecosysteme-agentique.md) — agents, niches, biomes, assignation d'agent à niche avec contrôle de capacité.

## Mémoire, collectif et évolution

- [neurobiologie-et-plasticite.md](neurobiologie-et-plasticite.md) — plasticité synaptique, dendrites, dissonance.
- [memoire-et-apprentissage.md](memoire-et-apprentissage.md) — mémoire épisodique/sémantique, vector search, STDP.
- [intelligence-de-nuee.md](intelligence-de-nuee.md) — phéromones, consensus, quorum, stigmergie.
- [fossilisation.md](fossilisation.md) — archive stratigraphique terminale des lignées.

## Familles spécialisées

- [biomimetisme/](biomimetisme/README.md) — foraging web, spécialisations cellulaires, super-sens animaux, primitives de controle animal.
- [nosologie/](nosologie/README.md) — 28 conditions simulées, neuf familles, 48 opérateurs de marqueurs et application signée persistante.
- [natural-creative-ecology.md](natural-creative-ecology.md) — cadre de créativité multi-échelle et boucle causale exécutable sur trois familles numériques bornées.
- [plan-implementation-natural-creative-ecology.md](plan-implementation-natural-creative-ecology.md) — lots livrés, preuves disponibles et critères scientifiques encore ouverts.
- [signal-plane-zero-text.md](signal-plane-zero-text.md) — transport zero-text inter-agents : récepteurs, coalescing, EventBus, plasticité.
- [natural-search-control-plane.md](natural-search-control-plane.md) — contrôle de pression et de progrès causal, ledger d'hypothèses, reprise atomique SQLite des phases 6–12 et transmission culturelle sous preuve.

## Voir aussi

- [../README.md](../README.md) — hub général.
- [../02-orchestration/README.md](../02-orchestration/README.md) — comment ces concepts s'exécutent.
