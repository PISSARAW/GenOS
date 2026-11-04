import fs from 'node:fs';
import {react} from './react-loop.mjs';
react(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
  .then(value => console.log(JSON.stringify({directory: value.directory, accepted: value.result.accepted})))
  .catch(error => {console.error(error); process.exitCode = 1;});
