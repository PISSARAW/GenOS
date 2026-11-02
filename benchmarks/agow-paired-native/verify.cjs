'use strict';

require('./archive.cjs').verify(process.argv[2]).then((result) => {
  console.log(JSON.stringify(result));
}).catch((error) => { console.error(error); process.exitCode = 1; });
