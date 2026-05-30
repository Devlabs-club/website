import React, { useEffect, useState } from 'react';

type MarkdownComponent = React.ComponentType<{ children: string }>;

export default function ChatMarkdown({ text }: { text: string }) {
  const [Markdown, setMarkdown] = useState<MarkdownComponent | null>(null);

  useEffect(() => {
    let active = true;
    void import('react-markdown').then((mod) => {
      if (active) setMarkdown(() => mod.default);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!Markdown) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  return <Markdown>{text}</Markdown>;
}
