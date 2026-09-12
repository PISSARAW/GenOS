#!/usr/bin/env node
// Thin CLI wrapper - the actual observe/think/act loop lives in
// backend/src/services/computerUseService.js, shared with the
// `computer_use_direct` strategy's `run_plan` primitive.
const { runMission } = require("../src/services/computerUseService");
const cliHelp = require('./cliHelp.cjs');
if (cliHelp.checkHelp(process.argv, 'genos-computer-use.cjs')) return;

const args = process.argv.slice(2);
const mission = args[0] || "Ouvre le bloc note et écrit GenOS V3.";

runMission(mission, { onLog: (line) => console.log(line) })
    .then((result) => {
        process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });


