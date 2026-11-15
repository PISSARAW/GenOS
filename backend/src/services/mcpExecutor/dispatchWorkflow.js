'use strict';

function preValidateTool(context) {
if (context.steric) context.context.docking = context.steric.docking || { mode: context.steric.mode };
}

module.exports = { preValidateTool };
