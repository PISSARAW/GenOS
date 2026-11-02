'use strict';

const LOGLINE_PATTERN = /prémisse|logline|prémisse dramatique/i;
const CHAR_SECTION_PATTERN = /personnages?|fiches? (?:de |des )?personnages?/i;
const CHAR_COUNT_PATTERN = /(?:-|\*|\d+\.)\s*\*\*?[A-Z][a-z]+/g;
const CHAR_SECRETS_PATTERN = /secrets?|secret/i;
const CHAR_OBJECTIVES_PATTERN = /objectifs?|objectif/i;
const BREAKDOWN_PATTERN = /séquencier|scènes? clés?|actes?/i;
const SCENE_MATCH_PATTERN = /(?:scène|acte)\s*(?:\d+|[ivx]+)/gi;
const SCENE_ALT_PATTERN = /\b\d+\.\s*scène/gi;
const STAGE_DIRECTIONS_PATTERN = /\b(?:EXT\.|INT\.|EXTERIEUR|INTERIEUR|JOUR|NUIT|NIGHT|DAY)\b/i;
const DIALOGUE_PATTERN = /^[A-Z][a-z]+\s*:\s*.+/gm;
const DRAMATURGIC_NOTE_PATTERN = /note d['’]analyse|dramaturgie|note dramaturgique|analyse dramatique/i;
const DRAMATIC_CONFLICT_PATTERN = /conflit|tension|obstacle|climax|confrontation|dénouement/i;

function checkLogline(text, defects) {
  if (!LOGLINE_PATTERN.test(text)) {
    defects.push({
      code: 'MISSING_LOGLINE',
      severity: 'major',
      section: 'premise',
      message: 'Prémisse dramatique ou logline absente.'
    });
    return 0;
  }
  return 15;
}

function checkCharacterCount(text, defects) {
  const hasCharacters = CHAR_SECTION_PATTERN.test(text);
  const characterCount = (text.match(CHAR_COUNT_PATTERN) || []).length;
  if (!hasCharacters || characterCount < 2) {
    defects.push({
      code: 'INSUFFICIENT_CHARACTERS',
      severity: 'major',
      section: 'characters',
      message: 'Moins de deux personnages formellement définis avec fiches distinctes.'
    });
    return 0;
  }
  return 15;
}

function checkCharacterDepth(text, defects) {
  const hasSecrets = CHAR_SECRETS_PATTERN.test(text);
  const hasObjectives = CHAR_OBJECTIVES_PATTERN.test(text);
  if (!hasSecrets || !hasObjectives) {
    defects.push({
      code: 'SHALLOW_CHARACTER_PROFILES',
      severity: 'minor',
      section: 'characters',
      message: 'Les objectifs ou les secrets des personnages ne sont pas explicites.'
    });
    return 0;
  }
  return 10;
}

function checkCharacters(text, defects) {
  return checkCharacterCount(text, defects) + checkCharacterDepth(text, defects);
}

function countScenes(text) {
  const primary = text.match(SCENE_MATCH_PATTERN) || [];
  const secondary = text.match(SCENE_ALT_PATTERN) || [];
  return primary.length + secondary.length;
}

function checkScenesAndBreakdown(text, defects) {
  const hasBreakdown = BREAKDOWN_PATTERN.test(text);
  const sceneCount = countScenes(text);
  if (!hasBreakdown && sceneCount < 3) {
    defects.push({
      code: 'INCOMPLETE_SCENE_BREAKDOWN',
      severity: 'major',
      section: 'scenes',
      message: 'Séquencier de scènes clés incomplet ou inférieur à 3 scènes.'
    });
    return 0;
  }
  return 20;
}

function checkStageDirections(text, defects) {
  if (!STAGE_DIRECTIONS_PATTERN.test(text)) {
    defects.push({
      code: 'MISSING_STAGE_DIRECTIONS',
      severity: 'minor',
      section: 'dialogues',
      message: 'Absence de didascalies standard (INT./EXT., JOUR/NUIT).'
    });
    return 0;
  }
  return 10;
}

function checkDialogueTurns(text, defects) {
  const hasDialogues = (text.match(DIALOGUE_PATTERN) || []).length;
  if (hasDialogues < 4) {
    defects.push({
      code: 'INSUFFICIENT_DIALOGUE_TURNS',
      severity: 'major',
      section: 'dialogues',
      message: 'Moins de 4 répliques dialoguées structurées par personnage.'
    });
    return 0;
  }
  return 15;
}

function checkDialoguesAndDirections(text, defects) {
  return checkStageDirections(text, defects) + checkDialogueTurns(text, defects);
}

function checkDramaturgicNote(text, defects) {
  if (!DRAMATURGIC_NOTE_PATTERN.test(text)) {
    defects.push({
      code: 'MISSING_DRAMATURGIC_NOTE',
      severity: 'minor',
      section: 'dramaturgy',
      message: 'Absence de note critique ou analyse dramaturgique.'
    });
    return 0;
  }
  return 10;
}

function checkDramaticConflict(text, defects) {
  if (!DRAMATIC_CONFLICT_PATTERN.test(text)) {
    defects.push({
      code: 'WEAK_DRAMATIC_STRUCTURE',
      severity: 'major',
      section: 'dramaturgy',
      message: 'Structure dramatique faible : tension ou conflit non matérialisé.'
    });
    return 0;
  }
  return 5;
}

function checkDramaturgy(text, defects) {
  return checkDramaturgicNote(text, defects) + checkDramaticConflict(text, defects);
}

function evaluateCreativeWriting(content, options = {}) {
  const text = typeof content === 'string' ? content : (content?.candidate || JSON.stringify(content || ''));
  const defects = [];

  const sLogline = checkLogline(text, defects);
  const sChars = checkCharacters(text, defects);
  const sScenes = checkScenesAndBreakdown(text, defects);
  const sDialogues = checkDialoguesAndDirections(text, defects);
  const sDrama = checkDramaturgy(text, defects);

  const rawScore = sLogline + sChars + sScenes + sDialogues + sDrama;
  const score = Math.max(0, Math.min(100, rawScore));
  const majorDefects = defects.filter((d) => d.severity === 'major');
  const minThreshold = options.threshold || 70;
  const passed = score >= minThreshold && majorDefects.length === 0;

  return {
    domain: 'creative_writing',
    score,
    overallScore: score,
    passed,
    valid: passed,
    threshold: minThreshold,
    defects,
    metrics: {
      hasLogline: sLogline > 0,
      charactersScore: sChars,
      scenesScore: sScenes,
      dialogueScore: sDialogues,
      dramaturgyScore: sDrama,
      majorDefectsCount: majorDefects.length,
      totalDefectsCount: defects.length
    },
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  evaluateCreativeWriting
};
