import { describe, expect, it } from 'bun:test';
import { markdownTablesToLists } from '@/components/ChatMarkdown';

describe('markdownTablesToLists', () => {
  it('converts a markdown table into a numbered list', () => {
    const input = `### Top recommendations
| Rank | Candidate | Score |
|---|---|---|
| 1 | **Ada** | 72 |
| 2 | Bob | 68 |`;
    const out = markdownTablesToLists(input);
    expect(out).toContain('1. **Ada**');
    expect(out).toContain('Score: 72');
    expect(out).not.toContain('|---|');
    expect(out).not.toContain('Candidate: Ada');
  });
});
