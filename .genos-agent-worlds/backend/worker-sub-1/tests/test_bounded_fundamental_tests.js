const assert = require('assert');
const { runBoundedTestCommand } = require('../src/services/primitiveHandlers/fundamentals');

runBoundedTestCommand('npm test', process.cwd(), 120000)
  .then((result) => {
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /test|PASS|pass/i);
    return Promise.resolve().then(() => runBoundedTestCommand('rm -rf /', process.cwd(), 1000)).then(
      () => { throw new Error('unsafe command was accepted'); },
      (error) => assert.match(error.message, /allow-listed/)
    );
  })
  .then(() => console.log('Bounded fundamental test checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });