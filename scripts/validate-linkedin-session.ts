import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LinkedInCookieJar } from '../src/lib/talent/builderEnrichment/linkedinSessionJar';
import {
  validateLinkedInSession,
  fetchLinkedInProfileViaVoyager,
} from '../src/lib/talent/builderEnrichment/linkedinVoyager';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.dev.vars'), override: true });

const testUrl = process.argv[2] || 'https://www.linkedin.com/in/yahia-alqurnawi/';

async function main() {
  LinkedInCookieJar.reset();
  const jar = LinkedInCookieJar.load();
  if (!jar) {
    console.error('No LinkedIn cookies configured in .dev.vars');
    process.exit(1);
  }

  const valid = await validateLinkedInSession(jar);
  console.log('sessionValid:', valid);
  console.log('sessionFile:', '.linkedin-session.json (auto-updated after each API call)');
  if (!valid) {
    console.error(
      'Session expired or rejected. Refresh li_at + JSESSIONID (+ bcookie/bscookie) in .dev.vars.',
      'Do NOT paste __cf_bm — it expires in ~30 min and stale values invalidate li_at.',
      'Delete .linkedin-session.json after updating cookies.'
    );
    process.exit(1);
  }

  const profile = await fetchLinkedInProfileViaVoyager(testUrl);
  console.log(
    JSON.stringify(
      {
        vanityName: profile.vanityName,
        headline: profile.headline,
        skills: profile.skills.slice(0, 8),
        positions: profile.positions.slice(0, 2),
        rawPreview: profile.rawText.slice(0, 400),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
