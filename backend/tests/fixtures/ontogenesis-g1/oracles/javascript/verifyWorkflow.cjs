'use strict';

function main(context) {
for (const term of ['average', 'percentile', 'summary', 'median', 'filter_above', 'empty']) {
        context.assert.ok(context.readme.includes(term));
      }
}

module.exports = { main };
