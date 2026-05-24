"use client";

import { useMemo } from "react";

/** Simple markdown-to-HTML converter for blog content */
function markdownToHtml(md: string): string {
  let html = md
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
      return `<pre class="bg-surface border border-border rounded-lg p-4 overflow-x-auto text-sm my-4"><code>${code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .trim()}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-surface border border-border px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-8 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-10 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-10 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-accent hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 mb-1 list-decimal">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-border my-8" />')
    // Blockquotes
    .replace(
      /^> (.+)$/gm,
      '<blockquote class="border-l-4 border-accent/30 pl-4 italic text-muted my-4">$1</blockquote>'
    );

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(
    /(<li class="ml-4 mb-1">[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ul class="list-disc my-4">${match}</ul>`
  );
  html = html.replace(
    /(<li class="ml-4 mb-1 list-decimal">[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ol class="list-decimal my-4">${match}</ol>`
  );

  // Paragraphs — wrap remaining lines that aren't already wrapped
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<blockquote") ||
        trimmed.startsWith("<hr")
      ) {
        return trimmed;
      }
      return `<p class="text-base leading-relaxed text-foreground/90 mb-4">${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

export default function BlogContent({ content }: { content: string }) {
  const html = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div
      className="prose-fundfly"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
