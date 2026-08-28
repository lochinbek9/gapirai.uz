"use client";

// frontend/app/video-analysis/[id]/page.tsx VA frontend/app/learn/[id]/page.tsx
// ikkalasi ham shu komponentni ishlatadi -- "Konspekt" tabining markup/xatti-
// harakati bitta joyda.

interface NotesTabProps {
  notes: string | null;
  loading: boolean;
  onGenerate: () => void;
}

export default function NotesTab({ notes, loading, onGenerate }: NotesTabProps) {
  return (
    <div>
      {notes ? (
        <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{notes}</div>
      ) : (
        <button
          onClick={onGenerate}
          disabled={loading}
          className="px-5 py-3 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-500/30 transition disabled:opacity-50"
        >
          {loading ? "Yaratilmoqda..." : "Konspekt tuzish"}
        </button>
      )}
    </div>
  );
}
