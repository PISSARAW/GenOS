'use strict';
const mode = process.argv[2];
process.on('disconnect', () => process.exit(0));
process.on('message', message => {
  if (mode === 'hang') return;
  if (mode === 'crash') process.exit(7);
  const id = mode === 'wrong-id' ? message.id + 1 : message.id;
  const taskId = mode === 'wrong-task' ? 'another-task' : message.input.task.id;
  process.send({ type: 'result', id, result: { taskId, solvable: true, expected: 1 } });
});
if (mode !== 'no-ready') process.send({ type: 'ready' });
