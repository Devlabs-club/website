import { describe, expect, it } from 'bun:test';
import { filterReachableBuilderLinks, probeLinkReachability } from './linkReachability';

function jsonResponse(status: number) {
  return Promise.resolve({ status, url: 'https://example.com' });
}

describe('link reachability', () => {
  it('treats DNS failures as confidently unreachable', async () => {
    const error = Object.assign(new Error('Was there a typo in the url or port?'), { cause: { code: 'ConnectionRefused' } });
    error.name = 'FailedToOpenSocket';
    const result = await probeLinkReachability('https://darshlukkad.com/', {
      fetch: async () => {
        throw error;
      },
    });
    expect(result.reachable).toBe(false);
    expect(result.confident).toBe(true);
  });

  it('hides HTTP 404s and keeps authwalled LinkedIn URLs', async () => {
    const notFound = await probeLinkReachability('https://github.com/missing-user-xyz', {
      fetch: async () => jsonResponse(404),
    });
    expect(notFound.reachable).toBe(false);
    expect(notFound.confident).toBe(true);

    const linkedin = await probeLinkReachability('https://www.linkedin.com/in/ada/', {
      fetch: async () => {
        throw new Error('should not fetch LinkedIn');
      },
    });
    expect(linkedin.reachable).toBe(true);
  });

  it('keeps sites that exist but block bots', async () => {
    const blocked = await probeLinkReachability('https://ada.dev/', {
      fetch: async () => jsonResponse(403),
    });
    expect(blocked.reachable).toBe(true);
  });

  it('strips unreachable portfolio links from builder cards', async () => {
    const { links, clearKeys } = await filterReachableBuilderLinks(
      {
        github: 'https://github.com/octocat',
        linkedin: 'https://www.linkedin.com/in/ada/',
        portfolio: 'https://darshlukkad.com/',
        personalWebsite: null,
        resume: 'https://res.cloudinary.com/demo/raw/upload/resume.pdf',
        devpost: null,
        twitter: null,
      },
      {
        fetch: async (url) => {
          if (String(url).includes('darshlukkad.com')) {
            throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
          }
          return jsonResponse(200);
        },
      }
    );
    expect(links.portfolio).toBeNull();
    expect(links.github).toBe('https://github.com/octocat');
    expect(links.linkedin).toBe('https://www.linkedin.com/in/ada/');
    expect(clearKeys).toEqual(['portfolio']);
  });
});
