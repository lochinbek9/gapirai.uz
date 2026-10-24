"use client";

import React, { useState } from "react";
import { Copy, Check, FileText } from "lucide-react";

interface MarkdownViewProps {
  content: string;
  className?: string;
  showCopy?: boolean;
}

export default function MarkdownView({ content, className = "", showCopy = true }: MarkdownViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format inline elements: **bold**, *italic*, `code`
  const renderInline = (text: string) => {
    // Split by code, bold, italic
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    // Pattern for inline tokens
    const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("***") && token.endsWith("***")) {
        parts.push(
          <strong key={key++} className="font-semibold italic text-white">
            {token.slice(3, -3)}
          </strong>
        );
      } else if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={key++} className="font-semibold text-white">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(
          <em key={key++} className="italic text-gray-300">
            {token.slice(1, -1)}
          </em>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 font-mono text-xs">
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // Parse lines into blocks
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let blockKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        blocks.push(
          <pre key={blockKey++} className="bg-black/60 border border-ui-rule rounded-xl p-4 overflow-x-auto my-3 font-mono text-xs text-ui-accent-ink">
            <code>{codeBuffer.join("\n")}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Empty line
    if (!trimmed) {
      continue;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={blockKey++} className="text-base font-semibold text-ui-accent-ink mt-5 mb-2.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400/80 inline-block" />
          <span>{renderInline(trimmed.replace(/^###\s+/, ""))}</span>
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={blockKey++} className="text-lg md:text-xl font-semibold text-ui-ink mt-7 mb-3 pb-2 border-b border-ui-rule flex items-center gap-2">
          <span className="text-ui-accent-ink">#</span>
          <span>{renderInline(trimmed.replace(/^##\s+/, ""))}</span>
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push(
        <h1 key={blockKey++} className="text-xl md:text-2xl font-semibold text-ui-ink mt-6 mb-4 pb-2 border-b border-blue-500/20">
          {renderInline(trimmed.replace(/^#\s+/, ""))}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      blocks.push(
        <h4 key={blockKey++} className="text-sm font-semibold text-ui-ink mt-3 mb-1.5 ">
          {renderInline(trimmed.replace(/^####\s+/, ""))}
        </h4>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      blocks.push(
        <blockquote key={blockKey++} className="border-l-4 border-blue-500/60 bg-blue-500/5 px-4 py-2.5 rounded-r-xl my-2.5 text-ui-muted italic text-sm">
          {renderInline(trimmed.replace(/^>\s+/, ""))}
        </blockquote>
      );
      continue;
    }

    // Unordered list item (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*]\s+/, "");
      blocks.push(
        <div key={blockKey++} className="flex items-start gap-2.5 my-1.5 pl-1.5 text-sm text-ui-muted leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-2" />
          <div className="flex-1">{renderInline(itemText)}</div>
        </div>
      );
      continue;
    }

    // Ordered list item (1. 2.)
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      blocks.push(
        <div key={blockKey++} className="flex items-start gap-2.5 my-1.5 pl-1 text-sm text-ui-muted leading-relaxed">
          <span className="text-xs font-mono font-semibold text-ui-accent-ink bg-blue-500/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
            {orderedMatch[1]}
          </span>
          <div className="flex-1">{renderInline(orderedMatch[2])}</div>
        </div>
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={blockKey++} className="text-sm text-ui-muted leading-relaxed my-2">
        {renderInline(trimmed)}
      </p>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {showCopy && (
        <div className="flex justify-end mb-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ui-ground hover:bg-ui-ground border border-ui-rule text-xs font-medium text-ui-muted hover:text-ui-ink transition shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-ui-green-ink" />
                <span className="text-ui-green-ink">Nusxalandi</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Konspektni nusxalash</span>
              </>
            )}
          </button>
        </div>
      )}
      <div className="space-y-0.5">{blocks}</div>
    </div>
  );
}
