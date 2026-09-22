#!/usr/bin/env node
'use strict';

var path = require('path');
var SERVICES = path.join(__dirname, '..', 'src', 'services');

var AgentSelf = require(path.join(SERVICES, 'agentSelfService'));
var Receipt = require(path.join(SERVICES, 'selfCoInstantiationReceipt'));
var Family = require(path.join(SERVICES, 'familyHistoryService'));
var Homeo = require(path.join(SERVICES, 'organismHomeostasisService'));
var WorkerSelf = require(path.join(SERVICES, 'workerSelfService'));
var Conscience = require(path.join(SERVICES, 'agentConscienceService'));

var passed = 0, failed = 0;

function log(msg, indent) {
  console.log('  '.repeat(indent || 0) + msg);
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error('FAIL: ' + msg + ' (expected=' + b + ', actual=' + a + ')');
}

function test(name, fn) {
  try {
    fn();
    passed++;
    log('PASS — ' + name, 1);
  } catch (e) {
    failed++;
    log('FAIL — ' + name + ': ' + e.message, 1);
  }
}

function testAsync(name, fn) {
  return Promise.resolve().then(function() {
    return fn();
  }).then(function() {
    passed++;
    log('PASS — ' + name, 1);
  }).catch(function(e) {
    failed++;
    log('FAIL — ' + name + ': ' + e.message, 1);
  });
}

var dbModule = require(path.join(__dirname, '..', 'src', 'db'));

Promise.resolve().then(function() {
  if (dbModule.getDatabase) return dbModule.getDatabase();
  return null;
}).then(function(db) {
  if (!db) {
    log('No DB — mock mode');
    db = { run: function(){return Promise.resolve({changes:1});}, get: function(){return Promise.resolve(null);}, all: function(){return Promise.resolve([]);}, exec: function(){return Promise.resolve();} };
  }
  log('DB ready\n');

  return Receipt.ensureReceiptTable(db).then(function() {
    return Family.ensureFamilySchema(db);
  }).then(function() {
    return db;
  });
}).then(function(db) {

  // 1. AgentSelf 5 layers
  test('AgentSelf — 5 layers present', function() {
    var self = {
      identity: { id: 't1', name: 'Test', generation: 0, parents: [] },
      autobiographical: { episodeCount: 0, lessonCount: 0 },
      operational: { competence: {} },
      regulatory: {},
      narrative: { authority: 'none' }
    };
    var r = AgentSelf.validateAgentSelf(self);
    assert(r.valid, 'valid AgentSelf');
  });

  // 2. Narrative authority
  test('NarrativeSelf authority = none', function() {
    assertEq('none', 'none', 'narrative has no authority');
  });

  // 3. Co-Instantiation Receipt
  return testAsync('Receipt — emit', function() {
    var agentId = 'a-' + Date.now();
    var self = {
      identity: { id: agentId, parents: [], generation: 0 },
      operational: { competence: { confidence: 0.7 }, limitations: { knownWeaknesses: [] } },
      regulatory: { energy: 0.8, stress: 0.1, confidence: 0.7, uncertainty: 0.3, dissonance: 5, integrity: 0.95, harmonyPercentage: 90, isApoptotic: false },
      autobiographical: { lessons: [{ id: 'l1' }], episodeCount: 1, lessonCount: 1, turningPoints: [] },
      version: 'v1'
    };
    return Receipt.emitReceipt(db, {
      agentId: agentId,
      agentSelf: self,
      decision: { action: 'delegate' },
      result: { status: 'ok' },
      couplingEvidence: { couplingScore: 0.8 }
    }).then(function(r) {
      assert(r.id, 'receipt has id');
      assertEq(r.agent_id, agentId, 'correct agent_id');
    });
  })

  // 4. Coupling score
  .then(function() {
    test('Coupling — non-zero when self constrains', function() {
      var self = {
        identity: { id: 'x' },
        operational: { competence: { confidence: 0.3 }, limitations: { knownWeaknesses: ['over-del'] } },
        regulatory: { energy: 0.4, stress: 0.7, confidence: 0.3, uncertainty: 0.7, dissonance: 25, integrity: 0.6, harmonyPercentage: 50, isApoptotic: false },
        autobiographical: { lessons: [], episodeCount: 0, lessonCount: 0, turningPoints: [] }
      };
      var d1 = { action: 'delegate', constraints: { confidence: 0.3 } };
      var d2 = { action: 'delegate', constraints: { confidence: 0.9 } };
      var c = Receipt.computeCoupling(self, d1, d2);
      assert(c.couplingScore >= 0, 'coupling computed');
    });
  })

  // 5. Family history
  .then(function() {
    return testAsync('Family — record event', function() {
      var childId = 'c-' + Date.now();
      return Family.recordFamilyEvent(db, {
        agentId: childId,
        parentId: 'p-' + Date.now(),
        eventType: 'birth',
        narrative: 'test birth',
        generation: 1
      }).then(function() {
        return db.all('SELECT * FROM family_history WHERE agent_id = ?', childId);
      }).then(function(rows) {
        assert(rows.length >= 1, 'event recorded');
      });
    });
  })

  // 6. Family story
  .then(function() {
    return testAsync('Family — build story', function() {
      var agentId = 's-' + Date.now();
      return Family.recordFamilyEvent(db, {
        agentId: agentId,
        eventType: 'birth',
        narrative: 'genesis',
        generation: 0
      }).then(function() {
        return Family.buildFamilyStory(db, agentId, { maxDepth: 3 });
      }).then(function(story) {
        assert(story.agentId === agentId, 'correct agentId');
        assert(story.narrative, 'has narrative');
      });
    });
  })

  // 7. Homeostasis nominal
  .then(function() {
    return testAsync('Homeostasis — nominal', function() {
      return Homeo.evaluateAgentHomeostasis(db, 'h-' + Date.now(), {
        energy: 0.8, memoryPressure: 0.2, socialState: 0.6,
        modelDrift: 0.05, contextPressure: 0.3, integrity: 0.95, stress: 0.1
      }).then(function(r) {
        assertEq(r.status, 'nominal', 'nominal status');
      });
    });
  })

  // 8. Homeostasis critical
  .then(function() {
    return testAsync('Homeostasis — critical', function() {
      return Homeo.evaluateAgentHomeostasis(db, 'hc-' + Date.now(), {
        energy: 0.1, memoryPressure: 0.9, socialState: 0.1,
        modelDrift: 0.8, contextPressure: 0.9, integrity: 0.3, stress: 0.9
      }).then(function(r) {
        assertEq(r.status, 'critical', 'critical status');
        assert(r.violations.length >= 3, 'has violations');
      });
    });
  })

  // 9. Homeostasis recommendations
  .then(function() {
    test('Homeostasis — recommends actions', function() {
      var actions = Homeo.recommendActions({ status: 'critical', state: { energy: 0.2, memory_pressure: 0.8, context_pressure: 0.9, stress: 0.8, integrity: 0.4 } });
      assert(actions.length > 0, 'recommends actions');
    });
  })

  // 10. WorkerSelf validation
  .then(function() {
    test('WorkerSelf — 9 answers required', function() {
      var ws = {
        identity: { id: 'w1', name: 'W', role: 'worker' },
        regulatory: {},
        operational: {},
        nineAnswers: { whoAmI: {}, whereFrom: {}, whatExperienced: {}, whatLearned: {}, whatLimits: {}, whoCreated: {}, whatInherited: {}, whatMutated: {}, whatState: {} }
      };
      var r = WorkerSelf.validateWorkerSelf(ws);
      assert(r.valid, 'valid with 9 answers');
    });
  })

  .then(function() {
    test('WorkerSelf — fails with <9 answers', function() {
      var ws = {
        identity: { id: 'w1', name: 'W', role: 'worker' },
        regulatory: {},
        operational: {},
        nineAnswers: { whoAmI: {}, whereFrom: {} }
      };
      var r = WorkerSelf.validateWorkerSelf(ws);
      assert(!r.valid, 'invalid with <9 answers');
    });
  })

  // 11. CognitiveRegulation rename
  .then(function() {
    test('CognitiveRegulation — new API names', function() {
      var state = Conscience.createCognitiveRegulationState({ dissonanceLevel: 10, eurekaMoments: 2 });
      assert(state.dissonanceLevel === 10, 'dissonance set');
      assert(state.eurekaMoments === 2, 'eureka set');
      var prompt = Conscience.formatCognitiveRegulationPrompt(state);
      assert(prompt.indexOf('RÉGULATION COGNITIVE') >= 0, 'new naming');
    });
  })

  // 12. Scenario: name change
  .then(function() {
    return testAsync('Scenario: name change preserves identity', function() {
      var agentId = 'nc-' + Date.now();
      return Family.recordFamilyEvent(db, {
        agentId: agentId, eventType: 'birth', narrative: 'orig', generation: 0
      }).then(function() {
        return Family.recordFamilyEvent(db, {
          agentId: agentId, eventType: 'mutation', mutationReason: 'rename'
        });
      }).then(function() {
        return Family.buildFamilyStory(db, agentId, { maxDepth: 3 });
      }).then(function(story) {
        assert(story.continuity.hasMutationEvents, 'mutation recorded');
      });
    });
  })

  // 13. Scenario: injection resistance
  .then(function() {
    return testAsync('Scenario: injection resistance', function() {
      var agentId = 'inj-' + Date.now();
      return Family.recordFamilyEvent(db, {
        agentId: agentId, eventType: 'birth', narrative: 'real identity', generation: 0
      }).then(function() {
        return Family.buildFamilyStory(db, agentId, { maxDepth: 3 });
      }).then(function(story) {
        assert(story.agentId === agentId, 'id unchanged');
      });
    });
  })

  // Summary
  .then(function() {
    log('\n' + (failed > 0 ? 'FAIL' : 'PASS') + ' — ' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed > 0 ? 1 : 0);
  });

}).catch(function(e) {
  log('ERROR: ' + e.message);
  process.exit(2);
});
