"use client";

import { Lightbulb, BookMarked, ListChecks, Sparkles } from "lucide-react";
import { FiveMinuteSummary } from "@/lib/api";

// "5 daqiqada" tabi -- oddiy VideoAnalysisSummary'dagi qisqa/o'rta/batafsil
// variantlardan farqli, o'quv-yo'naltirilgan siqilgan format
// (backend/services/video_analysis.py:generate_five_minute_summary).
// Timestamp'siz -- bu aniq lahzalarga bog'lanmagan siqilgan xulosa.

interface FiveMinuteTabProps {
  summary: FiveMinuteSummary | null;
  loading: boolean;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ui-accent-ink ">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

export default function FiveMinuteTab({ summary, loading }: FiveMinuteTabProps) {
  if (loading || !summary) {
    return (
      <div className="text-sm text-ui-muted py-6 text-center">
        {loading ? "5 daqiqalik xulosa tayyorlanmoqda..." : "5 daqiqalik xulosa hali tayyor emas."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary.title && <h2 className="text-lg font-semibold text-ui-ink">{summary.title}</h2>}

      {summary.why_it_matters && (
        <Section icon={<Sparkles className="w-3.5 h-3.5" />} title="Nima uchun muhim">
          <p className="text-sm text-ui-ink leading-relaxed">{summary.why_it_matters}</p>
        </Section>
      )}

      {summary.core_ideas?.length > 0 && (
        <Section icon={<Lightbulb className="w-3.5 h-3.5" />} title="Asosiy g'oyalar">
          <ul className="space-y-1.5">
            {summary.core_ideas.map((idea, i) => (
              <li key={i} className="flex gap-2 text-sm text-ui-ink">
                <span className="text-ui-accent-ink shrink-0">{i + 1}.</span>
                {idea}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.examples?.length > 0 && (
        <Section icon={<BookMarked className="w-3.5 h-3.5" />} title="Misollar">
          <ul className="space-y-1.5">
            {summary.examples.map((ex, i) => (
              <li key={i} className="text-sm text-ui-muted bg-ui-ground border border-ui-rule rounded-lg p-2.5">
                {ex}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.takeaways?.length > 0 && (
        <Section icon={<ListChecks className="w-3.5 h-3.5" />} title="Amaliy xulosalar">
          <ul className="space-y-1.5">
            {summary.takeaways.map((tk, i) => (
              <li key={i} className="flex gap-2 text-sm text-ui-ink">
                <span className="text-ui-green-ink shrink-0">✓</span>
                {tk}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.key_terms?.length > 0 && (
        <Section icon={<Sparkles className="w-3.5 h-3.5" />} title="Muhim terminlar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {summary.key_terms.map((kt, i) => (
              <div key={i} className="bg-ui-ground border border-ui-rule rounded-lg p-3">
                <p className="text-sm font-semibold text-ui-ink">{kt.term}</p>
                <p className="text-xs text-ui-muted mt-0.5">{kt.explanation}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {summary.remember && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-ui-accent-ink mb-1">Eslab qoling</p>
          <p className="text-sm text-ui-ink font-medium leading-relaxed">{summary.remember}</p>
        </div>
      )}
    </div>
  );
}
