'use strict';
const assert = require('assert');
const { recordLesson, consolidate, revalidate } = require('../src/services/interMissionConsolidationService');
const lesson = recordLesson({ lessonId: 'l1', lineageId: 'g1', evidenceRefs: ['e1'], niche: 'vision' });
assert.strictEqual(consolidate([lesson], { max: 1 }).count, 1);
assert.strictEqual(revalidate(lesson, ['e1']).reusable, true);
assert.strictEqual(revalidate(lesson, []).valid, false);
console.log('✅ inter-mission consolidation tests passed');
