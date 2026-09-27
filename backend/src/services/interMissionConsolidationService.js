'use strict';

function recordLesson(input) {
  const data = input || {};
  if (!data.lessonId || !data.lineageId || !Array.isArray(data.evidenceRefs) || !data.evidenceRefs.length) throw Object.assign(new Error('Lesson requires lineage and evidence'), { code: 'LESSON_UNVERIFIED' });
  return { lessonId: data.lessonId, lineageId: data.lineageId, evidenceRefs: [...data.evidenceRefs], niche: data.niche || 'general', fossil: Boolean(data.fossil), retainedAt: new Date().toISOString() };
}

function consolidate(lessons, options = {}) {
  const list = Array.isArray(lessons) ? lessons : [];
  const max = Math.max(1, Math.floor(Number(options.max) || 100));
  const retained = list.filter((lesson) => !lesson.fossil).slice(-max);
  return { retained, fossils: list.filter((lesson) => lesson.fossil), count: retained.length };
}

function revalidate(lesson, evidenceIds) {
  const available = new Set(Array.isArray(evidenceIds) ? evidenceIds : []);
  const valid = (lesson?.evidenceRefs || []).every((ref) => available.has(ref));
  return { lessonId: lesson?.lessonId || null, valid, reusable: valid && Boolean(lesson?.lineageId) };
}

module.exports = { recordLesson, consolidate, revalidate };
