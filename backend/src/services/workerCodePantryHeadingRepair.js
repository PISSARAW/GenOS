'use strict';

function ensurePantryHeading(content) {
  const source = String(content || '');
  if (/<h[1-6]\b[^>]*>[\s\S]*?pantry[\s\S]*?<\/h[1-6]\s*>/i.test(source)) return source;
  const heading = '<h1>Pantry Inventory</h1>';
  if (/<body\b[^>]*>/i.test(source)) return source.replace(/<body\b[^>]*>/i, (body) => `${body}${heading}`);
  return `${heading}${source}`;
}

module.exports = { ensurePantryHeading };
