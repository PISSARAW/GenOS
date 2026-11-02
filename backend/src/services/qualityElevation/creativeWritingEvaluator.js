'use strict';

function checkLogline(text, defects) {
  const hasLogline = /prémisse|logline|prémisse dramatique/i.test(text);
  if (!hasLogline) {
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
  const hasCharacters = /personnages?|fiches? (?:de )?personnages?/i.test(text);
  const characterCount = (text.match(/-\s*\*\*?[A-Z][a-z]+/g) || []).length;
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
  const hasSecrets = /secrets?|secret/i.test(text);
  const hasObjectives = /objectifs?|objectif/i.test(text);
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

function checkScenesAndBreakdown(text, defects) {
  const hasBreakdown = /séquencier|scènes? clés?/i.test(text);
  const sceneMatches = text.match(/scène\s*\d+/gi) || text.match(/\b\d+\.\s*scène/gi) || [];
  if (!hasBreakdown && sceneMatches.length < 3) {
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
  const hasDirections = /\b(?:EXT\.|INT\.|EXTERIEUR|INTERIEUR|JOUR|NUIT|NIGHT|DAY)\b/i.test(text);
  if (!hasDirections) {
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
  const hasDialogues = (text.match(/^[A-Z][a-z]+\s*:\s*.+/gm) || []).length;
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
  const hasNote = /note d['’]analyse|dramaturgie|note dramaturgique/i.test(text);
  if (!hasNote) {
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
  const hasConflict = /conflit|tension|obstacle|climax|confrontation|dénouement/i.test(text);
  if (!hasConflict) {
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
