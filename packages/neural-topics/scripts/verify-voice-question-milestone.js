const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const tsText = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');
const pyText = fs.readFileSync(path.join(root, 'python/neural_topics.py'), 'utf8');
const jsonObj = JSON.parse(fs.readFileSync(path.join(root, 'topics.json'), 'utf8'));
const jsonText = JSON.stringify(jsonObj);

const requiredTopics = [
  'sensory.hearing.question.finalized',
  'brain.cortex.rewrite.requested',
  'brain.cortex.rewrite.completed',
  'brain.cortex.rewrite.confirmed',
  'brain.cortex.answer.stream.think',
  'brain.cortex.answer.stream.chunk',
  'brain.cortex.answer.completed',
  'brain.cortex.answer.failed',
];

for (const topic of requiredTopics) {
  assert(tsText.includes(topic), `TS missing topic: ${topic}`);
  assert(pyText.includes(topic), `Python missing topic: ${topic}`);
  assert(jsonText.includes(topic), `JSON missing topic: ${topic}`);
}

const requiredStates = ['LISTENING', 'REWRITING', 'WAITING_CONFIRM', 'ANSWERING', 'DONE', 'ERROR'];
for (const state of requiredStates) {
  assert(tsText.includes(state), `TS missing state: ${state}`);
  assert(pyText.includes(state), `Python missing state: ${state}`);
}

console.log('voice-question milestone protocol: OK');
