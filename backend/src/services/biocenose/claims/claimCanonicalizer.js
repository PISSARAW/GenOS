'use strict';

function canonicalizeClaim(value) {
  const text = String(value?.statement ?? value?.text ?? '').normalize('NFKC').trim();
  const canonicalKey = text.toLocaleLowerCase('fr').replace(/\s+/g, ' ');
  return { ...value, statement: text, canonicalKey };
}

module.exports = { canonicalizeClaim };
