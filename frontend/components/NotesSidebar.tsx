"use client";

import { useState, useCallback, useMemo } from "react";
import type { IntelNote, NoteType } from "@/lib/types";
import { addNote, deleteNote } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { X, Trash2, Loader2 } from "lucide-react";

const NOTE_TYPE_ICON: Record<string, string> = {
  comment: "💬",
  insight: "💡",
  action_item: "✅",
  question: "❓",
};

const NOTE_TYPE_LABEL: Record<string, string> = {
  comment: "Comment",
  insight: "Insight",
  action_item: "Action item",
  question: "Question",
};

const SECTION_LABEL: Record<string, string> = {
  executive: "Executive",
  market: "Market",
  pricing: "Pricing",
  compare: "Compare",
};

function sectionDisplayName(section: string): string {
  if (SECTION_LABEL[section]) return SECTION_LABEL[section];
  if (section.startsWith("competitor:")) return section.replace("competitor:", "Competitor: ");
  return section;
}

export interface NotesSidebarProps {
  jobId: string | null;
  notes: IntelNote[];
  onNotesChange: (notes: IntelNote[]) => void;
  currentSection: string;
  isOpen: boolean;
  onClose: () => void;
  /** Optional default author for new notes */
  defaultAuthor?: string;
}

export function NotesSidebar({
  jobId,
  notes,
  onNotesChange,
  currentSection,
  isOpen,
  onClose,
  defaultAuthor = "",
}: NotesSidebarProps) {
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("comment");
  const [author, setAuthor] = useState(defaultAuthor);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groupedBySection = useMemo(() => {
    const map = new Map<string, IntelNote[]>();
    for (const n of notes) {
      const list = map.get(n.section) ?? [];
      list.push(n);
      map.set(n.section, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    const sections = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sections;
  }, [notes]);

  const handleAdd = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || !jobId) return;
    setAdding(true);
    try {
      const added = await addNote(jobId, {
        section: currentSection,
        content: trimmed,
        author: author.trim() || undefined,
        note_type: noteType,
      });
      onNotesChange([...notes, added]);
      setContent("");
    } catch {
      // Keep form state
    } finally {
      setAdding(false);
    }
  }, [jobId, currentSection, content, author, noteType, notes, onNotesChange]);

  const handleDelete = useCallback(
    async (noteId: string) => {
      if (!jobId) return;
      setDeletingId(noteId);
      try {
        await deleteNote(jobId, noteId);
        onNotesChange(notes.filter((n) => n.id !== noteId));
      } catch {
        // ignore
      } finally {
        setDeletingId(null);
      }
    },
    [jobId, notes, onNotesChange]
  );

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
        aria-label="Notes"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Add note form */}
        {jobId && (
          <div className="border-b border-gray-100 bg-gray-50/50 p-4">
            <p className="mb-2 text-xs font-medium text-gray-500">
              Add note to: <span className="text-gray-800">{sectionDisplayName(currentSection)}</span>
            </p>
            <textarea
              placeholder="Write a note or insight…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              className="mb-2 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as NoteType)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
              >
                {(["comment", "insight", "action_item", "question"] as const).map((t) => (
                  <option key={t} value={t}>
                    {NOTE_TYPE_ICON[t]} {NOTE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Your name (optional)"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-sm placeholder:text-gray-400"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!content.trim() || adding}
              className="w-full rounded-lg"
            >
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </div>
        )}

        {/* Notes list grouped by section */}
        <div className="flex-1 overflow-y-auto p-4">
          {groupedBySection.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No notes yet. Add one above.</p>
          ) : (
            <ul className="space-y-6">
              {groupedBySection.map(([section, sectionNotes]) => (
                <li key={section}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {sectionDisplayName(section)}
                  </h3>
                  <ul className="space-y-3">
                    {sectionNotes.map((note) => (
                      <li
                        key={note.id}
                        className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-700"
                            title={note.author}
                          >
                            {(note.author || "A").charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg" title={note.note_type}>
                                {NOTE_TYPE_ICON[note.note_type] ?? "💬"}
                              </span>
                              <span className="text-xs text-gray-500">
                                {note.author || "Anonymous"} · {formatTime(note.created_at)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                              {note.content}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-gray-400 hover:text-red-600"
                            onClick={() => handleDelete(note.id)}
                            disabled={deletingId === note.id}
                            aria-label="Delete note"
                          >
                            {deletingId === note.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
