// Questions for the live evaluation in the technical view. Each answerable question names the
// book section that answers it; printed pages are resolved from the book's page map.
import { readFile, writeFile } from 'node:fs/promises';

const pages = JSON.parse(await readFile(new URL('../src/data/book-pages.json', import.meta.url)));
const A = [
  ['Why should a text splitter repeat a little text between pieces?', 's7-3'],
  ['How can I tell if my model memorised the training data?', 's3-6'],
  ['Which number should a news report use for skewed house prices?', 's2-1'],
  ['Why is a rare-disease test with 95% accuracy still mostly wrong when positive?', 's2-2'],
  ['How do I keep an API key out of the browser?', 's6-4'],
  ['What makes a word match a related word even with no shared letters?', 's5-4'],
  ['How does a model decide which earlier words matter for the current word?', 's6-1'],
  ['When should I prefer recall over precision?', 's3-5'],
  ['What does the learning rate control during training?', 's4-3'],
  ['Why do image networks reuse the same small filter?', 's4-5'],
  ['How do I notice that live data no longer looks like training data?', 's8-5'],
  ['Why split time-based sales data by date instead of randomly?', 's3-2'],
  ['What is the point of a similarity cut-off in document search?', 's7-5'],
  ['Why do invented legal cases matter for AI products?', 's6-5'],
  ['How do I count words with a dictionary in Python?', 's1-2'],
  ['What goes wrong if I fill missing spend values with zero?', 's1-5'],
];
const U = [
  'Who painted the Mona Lisa?',
  'What is the boiling point of mercury?',
  'Give me a recipe for chicken biryani.',
  'What is the capital city of Australia?',
  'How many moons does Jupiter have?',
];
const out = {
  answerable: A.map(([q, anchor]) => ({ q, anchor, pages: [String(pages[anchor]), String(pages[`${anchor}b`] ?? pages[anchor])] })),
  unanswerable: U,
};
await writeFile(new URL('../public/data/eval.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`eval set: ${A.length} answerable, ${U.length} unanswerable`);
