import { useEffect, useRef } from "react";
import type { Score } from "@/modules/score";
import { copyFromSelection, cutEdit, pasteEdit, type Clip } from "../../application/clipboard";
import type { SheetRef } from "../../application/sheet-selection";
import type { CommitEdit } from "./use-score-editor";

type ClipboardEditor = {
  getScore: () => Score;
  picked: SheetRef[];
  commit: CommitEdit;
  setError: (message: string | null) => void;
  select: (id: string | null) => void;
  selectBar: (id: string | null) => void;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("input, textarea, select, [contenteditable=true]");

/**
 * ⌘C / ⌘X / ⌘V (Ctrl on Windows and Linux) on the sheet, except while typing in a field. A paste
 * selects what it wrote; pasting again (or onto what was copied) carries on after it. The copy
 * is kept here, so pasting in this score copies every detail, and it also goes to the system
 * clipboard as score text. With nothing copied here, ⌘V reads score text from the system clipboard.
 */
export function useClipboardShortcuts({ getScore, picked, commit, setError, select, selectBar }: ClipboardEditor) {
  const copied = useRef<Clip | null>(null);
  /** What the last paste wrote: pasting while it is selected continues after it. */
  const lastPasted = useRef<string[]>([]);
  const selection = useRef(picked);

  useEffect(() => {
    selection.current = picked;
  }, [picked]);

  useEffect(() => {
    const paste = (clip: Clip) => {
      try {
        const requestId = crypto.randomUUID();
        const before = getScore();
        const edit = pasteEdit(before, clip, selection.current, requestId, lastPasted.current);
        commit(edit.operation, edit.receipt, undefined, requestId);
        if (getScore() === before) return;
        // Select what was pasted, so the next ⌘V carries on after it.
        const pasted = edit.pasted(getScore());
        lastPasted.current = pasted.map((ref) => ref.id);
        if (pasted[0]?.kind === "bar") selectBar(pasted[0].id);
        else if (pasted[0]) select(pasted[0].id);
      } catch (error) {
        setError(error instanceof Error ? error.message : "That cannot be pasted here.");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "c" || key === "x") {
        const clip = copyFromSelection(getScore(), selection.current);
        if (!clip) return;
        event.preventDefault();
        copied.current = clip;
        lastPasted.current = [];
        navigator.clipboard?.writeText(clip.text).catch(() => {});
        if (key === "x") {
          const edit = cutEdit(clip);
          commit(edit.operation, edit.receipt);
        }
      }
      if (key === "v") {
        event.preventDefault();
        if (copied.current) return paste(copied.current);
        navigator.clipboard
          ?.readText()
          .then((text) => paste({ kind: "bars", scoreId: "", ids: [], text }))
          .catch(() => setError("Copy bars or notes first, then paste."));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit, getScore, select, selectBar, setError]);
}
