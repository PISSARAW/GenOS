'use strict';

function deriveStaffingSignals(debriefs = []) {
  const lessons = (Array.isArray(debriefs) ? debriefs : []).flatMap((row) => row.lessons || []);
  const grouped = new Map();
  for (const lesson of lessons.filter((entry) => entry.reusable && entry.category === 'staffing')) {
    const current = grouped.get(lesson.statement) || { statement: lesson.statement, occurrences: 0, evidenceIds: [] };
    current.occurrences += 1;
    if (lesson.evidenceId) current.evidenceIds.push(lesson.evidenceId);
    grouped.set(lesson.statement, current);
  }
  return [...grouped.values()];
}

module.exports = { deriveStaffingSignals };
