import { runPipeline } from './run.js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const mock = args.includes('--mock');
const receiptsFile = args.find((a) => a.startsWith('--receipts='))?.split('=')[1];
const result = await runPipeline({ mock, receiptsInput: receiptsFile ? JSON.parse(readFileSync(receiptsFile, 'utf8')) : undefined });
if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const r of result.rows) {
    console.log(`\n${r.shelter}  [${r.status}]  owed ${r.owed.toFixed(2)}  settled ${r.settled.toFixed(2)}  in-flight ${r.inFlight.toFixed(2)}  shelter says ${r.acknowledged.toFixed(2)}`);
    for (const f of r.flags) console.log(`  - ${f.code}: ${f.detail}`);
    if (r.explanation.nextAction) console.log(`  next: ${r.explanation.nextAction}  (${r.explanation.source})`);
  }
}
