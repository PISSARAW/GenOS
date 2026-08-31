/**
 * Unwraps JSON envelopes, double-stringified objects, escaped characters,
 * and extracts clean human-readable text from LLM / Griot outputs.
 */
export function cleanRawText(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let text = typeof raw === 'string' ? raw : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw));

  // 1. Strip ANSI escape codes and terminal banners
  text = text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/starting orchestrator\.\.\./gi, '')
    .replace(/adapter:\s*\w+/gi, '')
    .trim();

  // 2. Remove internal streaming lines
  text = text
    .split('\n')
    .filter((l: string) => !l.startsWith('GENOS_STREAM:'))
    .join('\n')
    .trim();

  // 3. Iterative unwrapping loop (handles up to 6 layers of JSON nesting or encoding)
  for (let depth = 0; depth < 6; depth++) {
    const s = text.trim();
    if (!s) break;

    // A. Direct JSON parse
    let parsed: any = null;
    try {
      parsed = JSON.parse(s);
    } catch {
      // If direct parse failed, try sanitizing common JSON formatting issues (like raw unescaped newlines in strings)
      try {
        const repaired = s.replace(
          /"text"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"(?:inputTokens|outputTokens|totalTokens|tokens|model|role|stop_reason|usage|id)"|\s*\}|\s*$)/g,
          (_, g1) => `"text":"${g1.replace(/\r/g, '').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`
        );
        parsed = JSON.parse(repaired);
      } catch {}
    }

    if (parsed !== null && parsed !== undefined) {
      if (typeof parsed === 'string') {
        text = parsed;
        continue;
      }
      if (typeof parsed === 'object') {
        if (typeof parsed.text === 'string') {
          text = parsed.text;
          continue;
        }
        if (typeof parsed.content === 'string') {
          text = parsed.content;
          continue;
        }
        if (typeof parsed.message === 'string') {
          text = parsed.message;
          continue;
        }
        if (typeof parsed.output === 'string') {
          text = parsed.output;
          continue;
        }
        if (typeof parsed.response === 'string') {
          text = parsed.response;
          continue;
        }
      }
    }

    // B. Robust regex extraction for `"text": "..."` followed by token metadata or envelope close
    const tokenRegex = /"text"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"(?:inputTokens|outputTokens|totalTokens|tokens|model|role|stop_reason|usage|id)"|\s*\}|\s*$)/;
    const tokenMatch = s.match(tokenRegex);
    if (tokenMatch && tokenMatch[1] !== undefined) {
      text = tokenMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      continue;
    }

    // C. General regex extraction for `"text": "..."` if string looks like JSON
    if (s.includes('"text"')) {
      const generalRegex = /"text"\s*:\s*"([\s\S]*?)"(?:\s*[,}])/;
      const genMatch = s.match(generalRegex);
      if (genMatch && genMatch[1] !== undefined) {
        text = genMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        continue;
      }
    }

    // D. Aggressive fallback for strings containing `"inputTokens"` metadata block
    if (s.includes('"inputTokens"') || s.includes('"outputTokens"')) {
      const idx = s.indexOf('"text"');
      if (idx !== -1) {
        let rest = s.substring(idx + 6).trim();
        if (rest.startsWith(':')) rest = rest.substring(1).trim();
        if (rest.startsWith('"')) {
          rest = rest.substring(1);
          const stopIdx = rest.search(/"\s*,\s*"(?:inputTokens|outputTokens|totalTokens|tokens|usage|id)"/);
          if (stopIdx !== -1) {
            text = rest.substring(0, stopIdx)
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            continue;
          }
        }
      }
    }

    // If no unwrapping occurred in this pass, we are done
    break;
  }

  // Final unescape pass for any remaining literal \n or \" if text is still escaped
  if (text.includes('\\n') && !text.includes('\n')) {
    text = text.replace(/\\n/g, '\n');
  }
  if (text.includes('\\"') && !text.includes('"')) {
    text = text.replace(/\\"/g, '"');
  }

  return text.trim();
}

export function parseGriotResponse(text: string) {
  let prefix = text;
  let data: any = null;
  let duration = '9m 44s';

  // 1. Initial cleanup
  let cleanText = (text || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/starting orchestrator\.\.\./gi, '')
    .replace(/adapter:\s*\w+/gi, '')
    .trim();

  cleanText = cleanText
    .split('\n')
    .filter((l: string) => !l.startsWith('GENOS_STREAM:'))
    .join('\n')
    .trim();

  // 2. Parse high-level orchestration data
  try {
    data = JSON.parse(cleanText);
    if (data && data.text) prefix = data.text;
  } catch {
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace >= 0) {
      try {
        data = JSON.parse(cleanText.substring(firstBrace));
        if (data && data.text) prefix = data.text;
      } catch {}
    }
  }

  // 3. Extract statement or evidence from telemetry events if present
  if (data?.telemetry?.length > 0) {
    for (let j = data.telemetry.length - 1; j >= 0; j--) {
      try {
        const ev = data.telemetry[j];
        if (ev.payload_json) {
          const payload = typeof ev.payload_json === 'string' ? JSON.parse(ev.payload_json) : ev.payload_json;
          if (payload.statement?.text) {
            prefix = payload.statement.text;
            break;
          }
          if (payload.evidenceReport?.claims?.[0]?.statement) {
            const stmt = payload.evidenceReport.claims[0].statement;
            prefix = typeof stmt === 'string' ? stmt : JSON.stringify(stmt);
            break;
          }
          if (payload.output) {
            prefix = payload.output;
            break;
          }
          if (payload.result) {
            prefix = payload.result;
            break;
          }
        }
      } catch {}
    }
  }

  // 4. Aggressively clean the final prefix to remove any JSON wrapper, inputTokens, escaped characters
  prefix = cleanRawText(prefix);

  if (data?.duration) duration = data.duration;
  if ((!prefix || prefix === text) && text.includes('starting') && text.includes('adapter:')) {
    prefix = "Mission terminée. Voir détails ci-dessous.";
  }

  return { prefix, data, duration };
}
