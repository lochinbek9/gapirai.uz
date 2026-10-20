"use client";

import React, { useState, useMemo } from "react";
import {
  BookOpen, Sparkles, Copy, Check, Download, Printer,
  Lightbulb, Wrench, CheckCircle2, Clock, FileText, ChevronRight, Bookmark
} from "lucide-react";
import GenerationCard from "./GenerationCard";

interface NotesTabProps {
  notes: string | null;
  loading: boolean;
  onGenerate: () => void;
}

interface ParsedItem {
  type: "concept" | "practice" | "tip" | "general";
  label?: string;
  content: string;
}

interface ParsedSection {
  id: string;
  number?: string;
  title: string;
  isConclusion?: boolean;
  items: ParsedItem[];
  rawText?: string;
}

interface ParsedNotes {
  mainTitle: string;
  intro: string[];
  sections: ParsedSection[];
  isStructured: boolean;
}

// Inline renderer for **bold**, *italic*, `code`
function renderInlineText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let match;
  let lastIndex = 0;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={key++} className="font-bold text-white tracking-wide">
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
        <code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 font-mono text-xs border border-white/5">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// Parser to turn raw AI markdown into structured data
function parseNotes(raw: string): ParsedNotes {
  const lines = raw.split("\n");
  let mainTitle = "Video konspekti";
  const intro: string[] = [];
  const sections: ParsedSection[] = [];

  let currentSection: ParsedSection | null = null;
  let currentRawLines: string[] = [];
  let sectionIndex = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Main title: # Title or ## Title (first one)
    if (!sections.length && !currentSection && (line.startsWith("# ") || line.startsWith("## "))) {
      mainTitle = line.replace(/^#{1,2}\s+/, "").trim();
      continue;
    }

    // Section header: ### Title
    if (line.startsWith("### ") || (sections.length > 0 && line.startsWith("## "))) {
      if (currentSection) {
        if (!currentSection.items.length && currentRawLines.length) {
          currentSection.rawText = currentRawLines.join("\n");
        }
        sections.push(currentSection);
      }

      const headerText = line.replace(/^#{2,3}\s+/, "").trim();
      // Match "1. Title" or "1 - Title"
      const numMatch = headerText.match(/^(\d+)[\.\-–\s]+(.*)$/);
      const isConclusion = /xulosa|maslahat|tavsiya|yakun/i.test(headerText);

      let number: string | undefined;
      let title = headerText;

      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        number = n < 10 ? `0${n}` : `${n}`;
        title = numMatch[2].trim();
      } else if (!isConclusion) {
        number = sectionIndex < 10 ? `0${sectionIndex}` : `${sectionIndex}`;
        sectionIndex++;
      }

      currentSection = {
        id: `section-${sections.length + 1}`,
        number,
        title,
        isConclusion,
        items: [],
      };
      currentRawLines = [];
      continue;
    }

    // Before any section starts, treat as intro
    if (!currentSection) {
      intro.push(line);
      continue;
    }

    currentRawLines.push(line);

    // Bullet point: - **Tushuncha:** ... or - **Amaliyot:** ...
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      const content = bulletMatch[1].trim();

      // Check for Tushuncha / Concept
      const conceptMatch = content.match(/^\*\*(?:Tushuncha|Nazariya|Konsept|Tushuntirish|Concept):\*\*\s*(.*)$/i);
      if (conceptMatch) {
        currentSection.items.push({
          type: "concept",
          label: "Tushuncha (Nazariya)",
          content: conceptMatch[1].trim(),
        });
        continue;
      }

      // Check for Amaliyot / Practice
      const practiceMatch = content.match(/^\*\*(?:Amaliyot|Qadamlar|Amaliy|Lab|Laboratoriya|Practice):\*\*\s*(.*)$/i);
      if (practiceMatch) {
        currentSection.items.push({
          type: "practice",
          label: "Amaliyot va Qadamlar",
          content: practiceMatch[1].trim(),
        });
        continue;
      }

      // Check for Xulosa / Maslahat / Tip
      const tipMatch = content.match(/^\*\*(?:Maslahat|Tavsiya|Xulosa|Eslatma|Tip|Note|Hujjatlashtirish|Python|Rivojlanish):\*\*\s*(.*)$/i);
      if (tipMatch) {
        const colonIdx = content.indexOf(":**");
        const customLabel = colonIdx > -1 ? content.slice(2, colonIdx) : "Maslahat";
        currentSection.items.push({
          type: "tip",
          label: customLabel,
          content: tipMatch[1].trim(),
        });
        continue;
      }

      // General bullet
      currentSection.items.push({
        type: "general",
        content,
      });
      continue;
    }

    // Plain paragraph within section
    currentSection.items.push({
      type: "general",
      content: line,
    });
  }

  if (currentSection) {
    if (!currentSection.items.length && currentRawLines.length) {
      currentSection.rawText = currentRawLines.join("\n");
    }
    sections.push(currentSection);
  }

  return {
    mainTitle,
    intro,
    sections,
    isStructured: sections.length > 0,
  };
}

export default function NotesTab({ notes, loading, onGenerate }: NotesTabProps) {
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    if (!notes) return null;
    return parseNotes(notes);
  }, [notes]);

  const stats = useMemo(() => {
    if (!notes) return { words: 0, minutes: 1 };
    const words = notes.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 140));
    return { words, minutes };
  }, [notes]);

  const handleCopy = () => {
    if (!notes) return;
    navigator.clipboard.writeText(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!notes) return;
    const blob = new Blob([notes], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(parsed?.mainTitle || "video-konspekt").replace(/[^a-zA-Z0-9_\u0400-\u04FF-]/g, "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!notes) {
    return (
      <GenerationCard
        badge="AI Konspekt"
        title="Video konspektini yaratish"
        description="Sun'iy intellekt videoning to'liq transkripti va mavzularini tahlil qilib, asosiy g'oyalar, voqealar ketma-ketligi va xulosalarni tartibli, o'qishga juda qulay konspekt shakliga keltiradi."
        buttonText="Konspekt tuzish"
        icon={<BookOpen className="w-6 h-6" />}
        features={[
          "Mavzular va bo'limlar bo'yicha tartiblangan",
          "Asosiy atamalar va formulalar ajratilgan",
          "O'qishga qulay format va xulosalar",
        ]}
        loading={loading}
        loadingSteps={[
          "Video transkripti yuklanmoqda va tahlil qilinmoqda...",
          "Asosiy mavzular va bo'limlar ajratilmoqda...",
          "Tushunchalar va xulosalar shakllantirilmoqda...",
          "Yakuniy konspekt formatlanib tayyorlanmoqda...",
        ]}
        estimatedTime="~15-20 soniya"
        onGenerate={onGenerate}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-900/30 via-black/40 to-blue-900/20 p-5 sm:p-7 backdrop-blur-xl shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-sm">
                <Sparkles className="w-3 h-3 text-violet-400" />
                AI Konspekt
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-gray-300 border border-white/10">
                <Clock className="w-3 h-3 text-blue-400" />
                ~{stats.minutes} daqiqalik o'qish
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-gray-400 border border-white/10">
                <FileText className="w-3 h-3 text-emerald-400" />
                {stats.words} ta so'z
              </span>
            </div>

            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white leading-tight tracking-tight">
              {parsed?.mainTitle}
            </h2>

            {parsed?.intro && parsed.intro.length > 0 && (
              <p className="text-xs sm:text-sm text-gray-300/90 leading-relaxed max-w-3xl pt-1">
                {parsed.intro.join(" ")}
              </p>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 hover:text-white transition shadow-sm active:scale-95"
              title="Konspekt matnini nusxalash"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Nusxalandi</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Nusxalash</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 hover:text-white transition shadow-sm active:scale-95"
              title="Markdown (.md) fayl sifatida yuklab olish"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Yuklab olish</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 hover:text-white transition shadow-sm active:scale-95"
              title="Chop etish yoki PDF sifatida saqlash"
            >
              <Printer className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">Chop etish</span>
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* 2. MUNDARIJA / QUICK NAVIGATION PILLS */}
      {parsed?.sections && parsed.sections.length > 1 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className="w-4 h-4 text-violet-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">
              Mundarija (Tezkor o'tish)
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {parsed.sections.map((sec, i) => (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-violet-600/20 border border-white/10 hover:border-violet-500/40 text-xs font-medium text-gray-300 hover:text-white transition shadow-sm"
              >
                {sec.number ? (
                  <span className="text-[10px] font-mono font-bold text-violet-400 group-hover:text-violet-300">
                    {sec.number}
                  </span>
                ) : sec.isConclusion ? (
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-500 group-hover:text-violet-400" />
                )}
                <span className="truncate max-w-[200px]">{sec.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. STRUCTURED SECTION CARDS */}
      <div className="space-y-5">
        {parsed?.sections.map((sec) => {
          if (sec.isConclusion) {
            // Special conclusion styling
            return (
              <div
                key={sec.id}
                id={sec.id}
                className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-black/40 to-teal-950/20 p-5 sm:p-6 backdrop-blur-sm shadow-lg space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {sec.title}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sec.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-emerald-500/15 space-y-1 hover:border-emerald-500/30 transition"
                    >
                      {item.label && (
                        <p className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                          {item.label}
                        </p>
                      )}
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {renderInlineText(item.content)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Regular numbered Section Card
          return (
            <div
              key={sec.id}
              id={sec.id}
              className="group relative rounded-2xl border border-white/10 hover:border-violet-500/30 bg-gradient-to-b from-white/[0.04] to-black/20 p-5 sm:p-6 backdrop-blur-sm transition-all duration-300 shadow-md hover:shadow-xl space-y-4"
            >
              {/* Section Header */}
              <div className="flex items-start gap-3.5">
                {sec.number && (
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-lg shadow-violet-500/20 border border-white/20">
                    {sec.number}
                  </div>
                )}
                <div className="flex-1 pt-0.5">
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-violet-200 transition">
                    {sec.title}
                  </h3>
                </div>
              </div>

              {/* Items: Concepts, Practices, and General Points */}
              <div className="space-y-3">
                {sec.items.map((item, idx) => {
                  if (item.type === "concept") {
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/[0.08] to-transparent p-4 space-y-1.5 transition shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                            <Lightbulb className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                            {item.label || "Tushuncha (Nazariya)"}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-200 leading-relaxed pl-7">
                          {renderInlineText(item.content)}
                        </p>
                      </div>
                    );
                  }

                  if (item.type === "practice") {
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/[0.08] to-transparent p-4 space-y-1.5 transition shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                            <Wrench className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                            {item.label || "Amaliyot va Qadamlar"}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-200 leading-relaxed pl-7">
                          {renderInlineText(item.content)}
                        </p>
                      </div>
                    );
                  }

                  if (item.type === "tip") {
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.08] to-transparent p-4 space-y-1.5 transition shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                            {item.label || "Tavsiya"}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-200 leading-relaxed pl-7">
                          {renderInlineText(item.content)}
                        </p>
                      </div>
                    );
                  }

                  // General bullet item
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs sm:text-sm text-gray-300 leading-relaxed"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-2" />
                      <div className="flex-1">{renderInlineText(item.content)}</div>
                    </div>
                  );
                })}

                {sec.rawText && (
                  <div className="text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {renderInlineText(sec.rawText)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
