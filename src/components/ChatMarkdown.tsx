import React from 'react';

type Props = {
  text: string;
  className?: string;
};

/**
 * Convert GitHub-flavored markdown tables into numbered sections so chat
 * never shows raw |---| pipes. Chat bubbles are too narrow for real tables.
 */
export function markdownTablesToLists(input: string): string {
  const lines = String(input || '').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const header = lines[i];
    const divider = lines[i + 1];
    const isTableHeader =
      /\|/.test(header) &&
      Boolean(divider) &&
      /^\s*\|?[\s|:.-]+\|?\s*$/.test(String(divider));

    if (!isTableHeader) {
      out.push(header);
      i += 1;
      continue;
    }

    const headers = splitTableRow(header);
    const titleCol = pickTitleColumn(headers);
    i += 2;
    let rowIndex = 0;
    while (i < lines.length && /\|/.test(lines[i]) && !/^\s*$/.test(lines[i])) {
      const cells = splitTableRow(lines[i]);
      rowIndex += 1;
      const rawTitle = (cells[titleCol] || cells.find((cell) => cell.trim()) || `Item ${rowIndex}`).trim();
      const title = stripMdEmphasis(rawTitle);
      out.push(`${rowIndex}. **${title}**`);
      headers.forEach((label, index) => {
        if (index === titleCol) return;
        const value = stripMdEmphasis((cells[index] || '').trim());
        if (!value || !label.trim()) return;
        // Skip redundant rank columns when the list number already conveys order.
        if (/^rank$/i.test(label.trim()) && /^\d+$/.test(value)) return;
        out.push(`   - ${label.trim()}: ${value}`);
      });
      out.push('');
      i += 1;
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function pickTitleColumn(headers: string[]): number {
  const preferred = headers.findIndex((label) =>
    /^(candidate|builder|name|person|who)$/i.test(label.trim())
  );
  if (preferred >= 0) return preferred;
  // Prefer the first non-rank column when present.
  const nonRank = headers.findIndex((label) => !/^rank$/i.test(label.trim()));
  return nonRank >= 0 ? nonRank : 0;
}

function stripMdEmphasis(value: string): string {
  return value.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/_{1,3}([^_]+)_{1,3}/g, '$1').trim();
}

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Lightweight chat markdown renderer.
 * Avoids react-markdown / micromark (CJS interop breaks Vite island hydration).
 */
export default function ChatMarkdown({ text, className }: Props) {
  const content = markdownTablesToLists(String(text || '').trim());
  if (!content) return null;

  return <div className={className || 'chat-markdown'}>{renderBlocks(content)}</div>;
}

function renderBlocks(markdown: string): React.ReactNode[] {
  const lines = markdown.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const fence = line.match(/^```(\w+)?/)?.[1] || '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      nodes.push(
        <pre key={key++} className="my-2 overflow-x-auto rounded-lg bg-black/5 p-2 text-[0.85em] text-inherit" data-lang={fence || undefined}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="my-3 border-black/10" />);
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const className =
        level <= 2
          ? 'mb-1.5 mt-3 text-base font-semibold leading-snug text-inherit first:mt-0'
          : level === 3
            ? 'mb-1 mt-2.5 text-sm font-semibold leading-snug text-inherit first:mt-0'
            : 'mb-1 mt-2 text-sm font-semibold leading-snug text-inherit first:mt-0';
      const Tag = level <= 2 ? 'h3' : 'h4';
      nodes.push(
        <Tag key={key++} className={className}>
          {renderInline(heading[2])}
        </Tag>
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      nodes.push(
        <blockquote key={key++} className="my-2 border-l-2 border-black/15 pl-3 opacity-80">
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      nodes.push(
        <ul key={key++} className="my-1.5 list-disc space-y-1 pl-4 text-inherit first:mt-0 last:mb-0">
          {items.map((item, index) => (
            <li key={index} className="leading-relaxed text-inherit">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemLines = [lines[i].replace(/^\s*\d+\.\s+/, '')];
        i += 1;
        while (i < lines.length && /^\s{2,}[-*+]\s+/.test(lines[i])) {
          itemLines.push(lines[i].replace(/^\s+/, ''));
          i += 1;
        }
        items.push(itemLines.join('\n'));
      }
      nodes.push(
        <ol key={key++} className="my-1.5 list-decimal space-y-1 pl-4 text-inherit first:mt-0 last:mb-0">
          {items.map((item, index) => (
            <li key={index} className="leading-relaxed text-inherit">
              {renderNestedListItem(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\*\*\*+$/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    nodes.push(
      <p key={key++} className="my-1.5 leading-relaxed text-inherit first:mt-0 last:mb-0">
        {renderInline(paragraph.join(' '))}
      </p>
    );
  }

  return nodes;
}

function renderNestedListItem(item: string): React.ReactNode {
  const parts = item.split('\n');
  const title = parts[0] || '';
  const nested = parts.slice(1).filter((line) => /^\s*[-*+]\s+/.test(line) || /^[-*+]\s+/.test(line));
  if (!nested.length) return renderInline(title);
  return (
    <>
      {renderInline(title)}
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {nested.map((line, index) => (
          <li key={index} className="leading-relaxed text-inherit">
            {renderInline(line.replace(/^\s*[-*+]\s+/, ''))}
          </li>
        ))}
      </ul>
    </>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      nodes.push(
        <strong key={key++} className="font-semibold text-inherit">
          {token.slice(2, -2)}
        </strong>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      nodes.push(
        <em key={key++} className="italic text-inherit">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={key++} className="rounded bg-black/5 px-1 py-0.5 text-[0.9em] text-inherit">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={key++}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#b55f1b] underline underline-offset-2"
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
