// Regenerates the embedded TS modules from clashr-llms.txt, clashr-skill.md, llms.txt and skill.md, so the
// web app and the API serve the same files without a text loader. Run after editing any of them:
// pnpm --filter @clashr/agents gen:llms (a test fails if you forget).
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const FILES = [
  {src:'clashr-llms.txt',out:'src/clashr-llms-txt.ts',name:'CLASHR_LLMS_TXT'},
  {src:'clashr-skill.md',out:'src/clashr-skill-md.ts',name:'CLASHR_SKILL_MD'},
  { src: 'llms.txt', out: 'src/llms-txt.ts', name: 'LLMS_TXT' },
  { src: 'skill.md', out: 'src/skill-md.ts', name: 'SKILL_MD' },
];

for (const f of FILES) {
  const text = readFileSync(new URL(f.src, root), 'utf8');
  const out = `// Generated from packages/agents/${f.src} by scripts/gen-llms.mjs. Edit ${f.src}, then run gen:llms.\nexport const ${f.name}: string = ${JSON.stringify(text)};\n`;
  writeFileSync(new URL(f.out, root), out);
  console.log(`${f.out}: ${text.length} chars`);
}
