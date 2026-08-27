#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (error instanceof RangeError || /call stack/i.test(message)) {
    console.error('This is a local analysis crash from large agent logs, not an account or API limit.');
  }
  process.exit(1);
});
