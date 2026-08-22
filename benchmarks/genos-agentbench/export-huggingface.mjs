#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const destination = path.join(here, 'huggingface', 'data');
const suite = JSON.parse(readFileSync(path.join(here, 'suite.json'), 'utf8'));
mkdirSync(destination, { recursive: true });

const tasks = suite.tasks.map((task) => {
  const directory = path.join(here, 'tasks', task.id);
  const implementation = task.id === 'lease-ledger' ? 'ledger.mjs'
    : task.id === 'retry-scheduler' ? 'scheduler.mjs' : 'rollout.mjs';
  return {
    benchmark: suite.suite,
    task_id: task.id,
    difficulty: task.difficulty,
    prompt: readFileSync(path.join(directory, 'task.md'), 'utf8'),
    starter_code: readFileSync(path.join(directory, implementation), 'utf8'),
    public_test: readFileSync(path.join(directory, 'public.test.mjs'), 'utf8'),
    language: 'javascript',
    license: 'apache-2.0',
  };
});
writeFileSync(path.join(destination, 'tasks.jsonl'), tasks.map((row) => JSON.stringify(row)).join('\n') + '\n');

const latest = JSON.parse(readFileSync(path.join(here, 'results', 'latest.json'), 'utf8'));
writeFileSync(path.join(destination, 'pilot-results.jsonl'), latest.samples.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log(path.relative(process.cwd(), destination));
