'use strict';

const controller = require('./rhizomeController');
const rhizomeTick = require('./rhizomeTick');

module.exports = { run: controller.run, tick: rhizomeTick.tick };
