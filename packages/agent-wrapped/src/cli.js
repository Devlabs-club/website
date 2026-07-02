import { analyzeCommand } from './commands/analyze.js';

function usage() {
  console.log(`DevLabs Agent Wrapped

Usage:
  agent-wrapped analyze --token <verified-upload-token> [--api <url>] [--public-url <url>] [--import <path>] [--yes] [--color] [--no-open]
  agent-wrapped doctor
  agent-wrapped login
  agent-wrapped preview
  agent-wrapped upload
`);
}

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }
  if (command === 'analyze') return analyzeCommand(rest);
  if (command === 'doctor') {
    console.log('Doctor checks are scaffolded. Run `agent-wrapped analyze --token <token>` to scan available agent sources.');
    return;
  }
  if (command === 'login' || command === 'preview' || command === 'upload') {
    console.log(`\`${command}\` is scaffolded for a future split-command flow. V1 uses \`analyze\` end to end.`);
    return;
  }
  usage();
  process.exitCode = 1;
}
