/**
 * GenOS Biomimetic NER Excision & Surgical Repair Patcher
 * Handles SEARCH/REPLACE block parsing, indentation recovery, and tolerance.
 */

const LINE_SPLIT = new RegExp('\\r?\\n');
const LEADING_NUM = new RegExp('^\\s*\\d+[:|]\\s?');
const CLEAN_MARKDOWN = new RegExp('```[a-zA-Z]*\\r?\\n<{3,}\\s*SEARCH', 'gi');
const SEARCH_SPLIT = new RegExp('(?:<{3,}|`{3,})\\s*SEARCH\\b[^\\n]*\\r?\\n', 'i');
const SEP_REGEX = new RegExp('\\r?\\n(?:={3,}|>{3,}|-{3,})(?:[^\\n]*)\\r?\\n');
const CLOSE_REGEX = new RegExp('\\r?\\n(?:>{3,}|`{3,})');
const INDENT_REGEX = new RegExp('^\\s*');

function stripLineNumbers(str) {
  const lines = str.split(LINE_SPLIT);
  return lines.map(l => l.replace(LEADING_NUM, '')).join('\n');
}

function parseSingleBlock(part) {
  const sepMatch = part.match(SEP_REGEX);
  if (!sepMatch) return null;
  const searchStr = stripLineNumbers(part.slice(0, sepMatch.index));
  const rest = part.slice(sepMatch.index + sepMatch[0].length);
  const closeMatch = rest.match(CLOSE_REGEX);
  const replaceStr = stripLineNumbers(closeMatch ? rest.slice(0, closeMatch.index) : rest.trimEnd());
  return { searchStr, replaceStr };
}

function extractSearchReplaceBlocks(patchBlock) {
  const blocks = [];
  const cleaned = patchBlock.replace(CLEAN_MARKDOWN, '<<<<<<< SEARCH');
  const parts = cleaned.split(SEARCH_SPLIT);
  for (let i = 1; i < parts.length; i++) {
    const block = parseSingleBlock(parts[i]);
    if (block) blocks.push(block);
  }
  return blocks;
}

function findExactOrTrimmedMatch(fileLines, searchLines) {
  for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
    let allMatch = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (fileLines[i + j].trimEnd() !== searchLines[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return i;
  }
  return -1;
}

function findIndentedMatch(fileLines, searchTrimmed) {
  for (let i = 0; i <= fileLines.length - searchTrimmed.length; i++) {
    let allMatch = true;
    for (let j = 0; j < searchTrimmed.length; j++) {
      if (searchTrimmed[j] === '') continue;
      if (fileLines[i + j].trim() !== searchTrimmed[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return i;
  }
  return -1;
}

function adjustIndentation(replaceStr, fileIndent, searchIndent) {
  if (fileIndent.length > searchIndent.length) {
    const extraIndent = ' '.repeat(fileIndent.length - searchIndent.length);
    return replaceStr.split(LINE_SPLIT)
      .map(line => line.trim().length > 0 ? extraIndent + line : line)
      .join('\n');
  }
  if (fileIndent.length < searchIndent.length) {
    const stripLen = searchIndent.length - fileIndent.length;
    return replaceStr.split(LINE_SPLIT)
      .map(line => line.startsWith(' '.repeat(stripLen)) ? line.slice(stripLen) : line)
      .join('\n');
  }
  return replaceStr;
}

function replaceByIndentedMatch(fileLines, searchLines, replaceStr) {
  const searchTrimmed = searchLines.map(l => l.trim());
  const indentFoundIdx = findIndentedMatch(fileLines, searchTrimmed);
  if (indentFoundIdx === -1) return null;

  const fileIndent = (fileLines[indentFoundIdx].match(INDENT_REGEX) || [''])[0];
  const searchIndent = (searchLines.find(l => l.trim().length > 0)?.match(INDENT_REGEX) || [''])[0];
  const adjustedReplace = adjustIndentation(replaceStr, fileIndent, searchIndent);

  fileLines.splice(indentFoundIdx, searchLines.length, adjustedReplace);
  return fileLines.join('\n');
}

function applySingleBlock(currentCode, searchStr, replaceStr) {
  if (currentCode.includes(searchStr)) {
    return currentCode.replace(searchStr, replaceStr);
  }

  const searchLines = searchStr.split(LINE_SPLIT).map(l => l.trimEnd());
  const fileLines = currentCode.split(LINE_SPLIT);
  const foundIdx = findExactOrTrimmedMatch(fileLines, searchLines);

  if (foundIdx !== -1) {
    fileLines.splice(foundIdx, searchLines.length, replaceStr);
    return fileLines.join('\n');
  }

  return replaceByIndentedMatch(fileLines, searchLines, replaceStr);
}

function applySearchReplace(originalCode, patchBlock) {
  const blocks = extractSearchReplaceBlocks(patchBlock);
  let modified = originalCode;
  let replacementsCount = 0;

  for (const { searchStr, replaceStr } of blocks) {
    const nextModified = applySingleBlock(modified, searchStr, replaceStr);
    if (nextModified !== null) {
      modified = nextModified;
      replacementsCount++;
    }
  }

  return { modified, replacementsCount };
}

module.exports = {
  stripLineNumbers,
  extractSearchReplaceBlocks,
  applySearchReplace
};
