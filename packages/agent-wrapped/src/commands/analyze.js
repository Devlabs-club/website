import fs from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { discoverAgentSources, readSourceSamples } from '../sources/discover.js';
import { collectUsageTelemetry } from '../sources/usageCollector.js';
import { generateReport } from '../report/generateReport.js';
import { previewReport } from '../preview/previewReport.js';
import { uploadReport } from '../upload/uploadReport.js';
import { decodeUploadToken } from '../upload/token.js';
import { openBrowser } from '../utils/openBrowser.js';

function parseArgs(argv) {
  const args = {
    imports: [],
    yes: false,
    color: undefined,
    open: true,
    api: process.env.DEVLABS_API_URL || 'https://www.devlabs.club',
    publicUrl: process.env.DEVLABS_PUBLIC_URL || 'https://www.devlabs.club',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--token') args.token = argv[++index];
    else if (item === '--api') args.api = argv[++index];
    else if (item === '--public-url') args.publicUrl = argv[++index];
    else if (item === '--import') args.imports.push(argv[++index]);
    else if (item === '--yes' || item === '-y') args.yes = true;
    else if (item === '--color') args.color = true;
    else if (item === '--no-color') args.color = false;
    else if (item === '--no-open') args.open = false;
  }
  return args;
}

function isYes(answer) {
  return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
}

function createPrompter(skipPrompts) {
  if (skipPrompts) return { askYes: async () => true, close: () => {} };
  if (!input.isTTY) {
    const answers = fs.readFileSync(0, 'utf8').split(/\r?\n/);
    return {
      askYes: async (question) => {
        output.write(question);
        const answer = answers.shift() || '';
        output.write('\n');
        return isYes(answer);
      },
      close: () => {},
    };
  }
  const rl = createInterface({ input, output });
  return {
    askYes: async (question) => isYes(await rl.question(question)),
    close: () => rl.close(),
  };
}

export async function analyzeCommand(argv) {
  const args = parseArgs(argv);
  if (!args.token) throw new Error('Missing --token. Copy the command from the DevLabs phone verification screen.');
  const tokenPayload = decodeUploadToken(args.token);
  if (!tokenPayload?.builderId) throw new Error('The upload token is malformed.');
  const prompter = createPrompter(args.yes);

  try {
    console.log('DevLabs Agent Wrapped');
    console.log('Scanning builder-level AI agent usage sources...');

    const sources = await discoverAgentSources({ imports: args.imports });
    if (!sources.length) {
      console.log('No local agent sources found. Add exported summaries with `--import <path>` and run again.');
      return;
    }

    console.log(`Detected ${sources.length} source${sources.length === 1 ? '' : 's'}:`);
    for (const source of sources) {
      console.log(`- ${source.agent}: ${source.kind} (${source.safeCountLabel})`);
    }

    if (!args.yes) {
      const approvedSources = await prompter.askYes('Analyze these sources locally? [y/N] ');
      if (!approvedSources) {
        console.log('Analysis cancelled. Nothing was read or uploaded.');
        return;
      }
    }

    const samples = await readSourceSamples(sources);
    console.log('Collecting usage telemetry (hours, tokens, models, rhythm)...');
    let usage = null;
    try {
      usage = await collectUsageTelemetry();
    } catch (error) {
      console.error('Usage telemetry hit a local analysis error; continuing with session summaries only.');
      const message = error instanceof Error ? error.message : String(error);
      if (/call stack/i.test(message)) {
        console.error('This is a stack overflow from large local agent logs, not an account limit.');
      }
    }
    const report = generateReport({
      builderId: tokenPayload.builderId,
      builderName: tokenPayload.email?.split('@')[0],
      samples,
      usage,
      publicRoot: args.publicUrl,
    });

    previewReport(report, sources, { color: args.color });

    if (!args.yes) {
      const approved = await prompter.askYes('Upload this wrapped report to DevLabs? [y/N] ');
      if (!approved) {
        console.log('Upload cancelled. Nothing was sent to DevLabs.');
        return;
      }
    }

    const result = await uploadReport({
      apiRoot: args.api,
      token: args.token,
      builderId: tokenPayload.builderId,
      report,
    });

    console.log('Uploaded Agent Wrapped report.');
    const publicUrl = new URL(result.publicUrl, args.publicUrl).toString();
    console.log(`Public URL: ${publicUrl}`);
    if (args.open) {
      const opened = await openBrowser(publicUrl);
      console.log(opened ? 'Opened shareable Wrapped card in your browser.' : 'Could not open browser automatically. Open the public URL above.');
    }
  } finally {
    prompter.close();
  }
}
