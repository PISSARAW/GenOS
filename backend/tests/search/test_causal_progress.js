/**
 * Tests du senseur de progrès causal.
 *
 * Invariant essentiel :
 *  - 20 actions différentes mais 0 preuve, 0 réduction d'incertitude, 0 objectif
 *    → détecté comme stagnation (rendements décroissants ou recherche à rendement nul).
 *  - Le simple entropy sentinel aujourd'hui risque de voir ça comme de l'exploration.
 *    Ici, on distingue variation comportementale ≠ progrès causal.
 */
const assert = require('node:assert/strict')
const { CausalProgressService, SearchProgressWindow } = require('../../src/services/search/causalProgressService')

// ---------------------------------------------------------------------------
// SearchProgressWindow
// ---------------------------------------------------------------------------

{
  const win = new SearchProgressWindow()

  // Pas d'étape → pas de rendement décroissant
  assert.equal(win.detectDiminishingReturns(), false, 'empty window is not diminishing')

  // Un seul pas → non comparable
  win.pushStep({
    evidenceGain: 1,
    uncertaintyReduction: 0.2,
    constraintsResolved: 1,
    verifiedArtifactDelta: 0,
    objectiveDelta: 0.5,
    hypothesisInformationGain: 0,
    tokensConsumed: 100,
    timeConsumed: 1,
    costConsumed: 0.01
  })
  assert.equal(win.detectDiminishingReturns(), false, 'single step is not diminishing')

  // Deux pas : premier riche, second pauvre → rendements décroissants
  win.pushStep({
    evidenceGain: 0.02,
    uncertaintyReduction: 0.01,
    constraintsResolved: 0,
    verifiedArtifactDelta: 0,
    objectiveDelta: 0.01,
    hypothesisInformationGain: 0,
    tokensConsumed: 100,
    timeConsumed: 1,
    costConsumed: 0.01
  })
  assert.equal(win.detectDiminishingReturns(0.5), true, 'second step much poorer than first → diminishing')

  // Deux pas : second meilleur → pas de rendements décroissants
  const win2 = new SearchProgressWindow()
  win2.pushStep({
    evidenceGain: 0.1,
    uncertaintyReduction: 0.05,
    constraintsResolved: 0,
    verifiedArtifactDelta: 0,
    objectiveDelta: 0.02,
    hypothesisInformationGain: 0,
    tokensConsumed: 100,
    timeConsumed: 1,
    costConsumed: 0.01
  })
  win2.pushStep({
    evidenceGain: 0.3,
    uncertaintyReduction: 0.1,
    constraintsResolved: 0,
    verifiedArtifactDelta: 0,
    objectiveDelta: 0.05,
    hypothesisInformationGain: 0,
    tokensConsumed: 100,
    timeConsumed: 1,
    costConsumed: 0.01
  })
  assert.equal(win2.detectDiminishingReturns(0.5), false, 'improving steps are not diminishing')

  // Somme pondérée utile
  const win3 = new SearchProgressWindow()
  win3.pushStep({
    evidenceGain: 0.4,
    uncertaintyReduction: 0.2,
    constraintsResolved: 0.1,
    verifiedArtifactDelta: 0.15,
    objectiveDelta: 0.15,
    hypothesisInformationGain: 0,
    tokensConsumed: 100,
    timeConsumed: 1,
    costConsumed: 0.01
  })
  assert.ok(win3.weightedUsefulTotal() > 0, 'weighted useful total is positive')
}

// ---------------------------------------------------------------------------
// CausalProgressService : détection de stagnation sémantique
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()

  // 20 actions "différentes" mais sans progrès réel
  for (let i = 0; i < 20; i++) {
    svc.ingestEvent({
      eventType: 'AGENT_STEP',
      action: `tool_${i}`,
      payload: {
        evidenceGain: 0,
        uncertaintyReduction: 0,
        constraintsResolved: 0,
        verifiedArtifactDelta: 0,
        objectiveDelta: 0,
        hypothesisInformationGain: 0,
        tokensConsumed: 50,
        timeConsumed: 0.5,
        costConsumed: 0.001
      }
    })
  }

  const report = svc.report()
  const win = report.window

  // Progrès utile ~ 0 dans la fenêtre
  assert.equal(win.evidenceGain, 0, 'no evidence despite many actions')
  assert.equal(win.uncertaintyReduction, 0, 'no uncertainty reduction')
  assert.equal(win.constraintsResolved, 0, 'no constraints resolved')
  assert.equal(win.objectiveDelta, 0, 'no objective progress')

  // Mais les ressources ont été consommées
  assert.ok(win.tokensConsumed > 0, 'tokens consumed even without progress')
  assert.ok(win.timeConsumed > 0, 'time consumed even without progress')

  // Rendement de recherche ≈ 0 (proche de zéro, mais pas exactement zéro à cause
  // du petit coût résiduel si weightedUseful est zéro).
  assert.ok(win.searchYield < 0.001, 'search yield near zero when no useful progress')

  // Le diagnostic ne signale pas de rendements décroissants car chaque pas est nul
  // (on ne peut pas diviser par zéro). C'est intentionnel : on ne diagnostique pas
  // de décroissance quand il n'y a pas de progression de départ.
  assert.ok(
    report.diagnostics.stepsInWindow === 20,
    'window retains all 20 steps'
  )
}

// ---------------------------------------------------------------------------
// Progrès productif : le système doit aussi reconnaître quand ça marche
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()

  for (let i = 0; i < 6; i++) {
    svc.ingestEvent({
      eventType: 'AGENT_STEP',
      action: 'probe',
      payload: {
        evidenceGain: 0.2,
        uncertaintyReduction: 0.1,
        constraintsResolved: 1,
        verifiedArtifactDelta: 0.1,
        objectiveDelta: 0.1,
        hypothesisInformationGain: 0.05,
        tokensConsumed: 10,
        timeConsumed: 0.1,
        costConsumed: 0.001
      }
    })
  }

  const report = svc.report()
  const win = report.window

  assert.ok(win.evidenceGain > 0.5, 'evidence accumulates')
  assert.ok(win.constraintsResolved >= 6, 'constraints resolved count reflects steps')
  assert.ok(win.searchYield > 0.1, 'productive search yield is high enough')
}

// ---------------------------------------------------------------------------
// Objectif global : suivi de la progression vers un objectif
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()

  svc.seedObjective(100) // objectif initial = 100 unités à réduire/parcourir

  svc.ingestEvent({
    eventType: 'AGENT_STEP',
    action: 'step1',
    payload: {
      objectiveDelta: -10,
      tokensConsumed: 100,
      timeConsumed: 1,
      costConsumed: 0.01
    }
  })

  const report = svc.report()
  assert.ok(
    Number.isFinite(report.window.objectiveDelta),
    'objective delta is finite'
  )
  // delta cumulé = -10, objectif initial 100 → progression relative
  assert.ok(
    report.diagnostics.objectiveProgress < 0,
    'objective progress reflects reduction toward goal'
  )
}

// ---------------------------------------------------------------------------
// Intégration : ingestion d'événements variés avec preuves et faux-semblants
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()

  // Phase 1 : beaucoup d'actions sans preuve (ex.: grep, python, test, web, database, git, shell)
  const noiseActions = [
    'grep',
    'python',
    'test',
    'web',
    'database',
    'git',
    'shell',
    'inspect',
    'log',
    'read'
  ]

  for (const action of noiseActions) {
    svc.ingestEvent({
      eventType: 'AGENT_STEP',
      action,
      payload: {
        evidenceGain: 0,
        uncertaintyReduction: 0,
        constraintsResolved: 0,
        verifiedArtifactDelta: 0,
        objectiveDelta: 0,
        hypothesisInformationGain: 0,
        tokensConsumed: 60,
        timeConsumed: 0.6,
        costConsumed: 0.006
      }
    })
  }

  // Phase 2 : soudain, une preuve réelle
  svc.ingestEvent({
    eventType: 'EVIDENCE_REPORT',
    action: 'verify',
    payload: {
      evidenceGain: 0.8,
      uncertaintyReduction: 0.5,
      constraintsResolved: 1,
      verifiedArtifactDelta: 0,
      objectiveDelta: 0.1,
      hypothesisInformationGain: 0.3,
      tokensConsumed: 120,
      timeConsumed: 1.2,
      costConsumed: 0.012
    }
  })

  const report = svc.report()

  assert.ok(
    report.window.evidenceGain >= 0.8,
    'real evidence is captured'
  )
  assert.ok(
    report.window.uncertaintyReduction >= 0.5,
    'uncertainty reduction is captured'
  )
  assert.ok(
    report.window.constraintsResolved >= 1,
    'constraint resolution is captured'
  )
  assert.ok(
    report.window.searchYield > 0.05,
    'yield improves after genuine evidence'
  )

  // Variante : preuve mais énorme coût → rendement faible
  const svc2 = new CausalProgressService()
  svc2.ingestEvent({
    eventType: 'EVIDENCE_REPORT',
    action: 'expensive_verify',
    payload: {
      evidenceGain: 0.3,
      uncertaintyReduction: 0.1,
      constraintsResolved: 0,
      verifiedArtifactDelta: 0,
      objectiveDelta: 0.02,
      hypothesisInformationGain: 0.05,
      tokensConsumed: 5000,
      timeConsumed: 50,
      costConsumed: 0.5
    }
  })
  const report2 = svc2.report()
  assert.ok(
    report2.window.searchYield < 0.001,
    'high cost, low yield → near-zero search yield'
  )
}

// ---------------------------------------------------------------------------
// Rendements décroissants dans une séance productive
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()

  svc.ingestEvent({
    eventType: 'AGENT_STEP',
    action: 'rich_step_1',
    payload: {
      evidenceGain: 0.6,
      uncertaintyReduction: 0.3,
      constraintsResolved: 1,
      verifiedArtifactDelta: 0,
      objectiveDelta: 0.1,
      hypothesisInformationGain: 0.2,
      tokensConsumed: 100,
      timeConsumed: 1,
      costConsumed: 0.01
    }
  })

  svc.ingestEvent({
    eventType: 'AGENT_STEP',
    action: 'poor_step_2',
    payload: {
      evidenceGain: 0.05,
      uncertaintyReduction: 0.02,
      constraintsResolved: 0,
      verifiedArtifactDelta: 0,
      objectiveDelta: 0.01,
      hypothesisInformationGain: 0,
      tokensConsumed: 200,
      timeConsumed: 2,
      costConsumed: 0.02
    }
  })

  assert.equal(
    svc.report().diagnostics.diminishingReturns,
    true,
    'clear diminishing returns between two steps'
  )
}

// ---------------------------------------------------------------------------
// Nettoyage après événement terminal : la fenêtre se réinitialise partiellement
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()

  svc.ingestEvent({
    eventType: 'AGENT_STEP',
    action: 'pre_fork',
    payload: { tokensConsumed: 100 }
  })

  // Simuler un événement terminal (fork)
  svc.resetAfterEvent({ eventType: 'AGENT_COMPLETED' })

  assert.equal(
    svc.report().window.steps,
    0,
    'window cleared after terminal event reset'
  )
  // agrégats globaux conservés
  assert.ok(
    svc.report().global.tokensConsumed > 0,
    'global aggregates persist across reset'
  )
}

console.log('Causal Progress Sensor tests passed.')
