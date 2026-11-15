'use strict';

async function mainStep1(context) {
if (context.db) await context.closeDatabase();
}

module.exports = { mainStep1 };
