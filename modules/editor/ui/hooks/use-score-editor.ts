import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectRepository } from "@/modules/projects";
import {
  createExample,
  createSession,
  execute,
  executeAll,
  travel,
  type Command,
  type Operation,
  type Score,
} from "@/modules/score";
import { removeItemOperation, type SheetItem } from "../../application/notation-edits";
import { findSelection, selectionAfterEdit } from "../../application/selection";
import { useNoteCommands } from "./use-note-commands";
import { useSheetSelection } from "./use-sheet-selection";

const RECEIPT_LIMIT = 5;

/** `requestId` only when the operation was built for one (score text that adds bars names them after it). */
export type CommitEdit = (operation: Operation, receipt: string, expectedRevision?: number, requestId?: string) => void;
export type ScoreEditor = ReturnType<typeof useScoreEditor>;

/**
 * Owns the local editing session: the score, undo/redo, selection, save status and edit
 * receipts. Every change goes through `execute`/`travel`; this hook only wires them to React.
 * `onBeforeEdit` runs before any score change (used to stop playback).
 */
export function useScoreEditor(onBeforeEdit: () => void, repository: ProjectRepository) {
  const [session, setSession] = useState(() => createSession(createExample()));
  // Mirrors `session` so rapid successive edits read the latest revision, not a stale render.
  const latest = useRef(session);
  const latestScore = useCallback(() => latest.current.score, []);
  const sheetSelection = useSheetSelection(session.score, latestScore);
  const { selectedId, setSelectedId, selectedBarId, selectedItem, select, selectBar, selectItem, clear } =
    sheetSelection;
  const [loaded, setLoaded] = useState(false);
  // Locked while the assistant works on the score: its turn commits as one step when it ends.
  const [locked, setLocked] = useState(false);
  const ready = loaded && !locked;
  const [saveStatus, setSaveStatus] = useState("Opening local score…");
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<string[]>([]);
  // Stays false if the saved draft is unreadable, so we never overwrite it.
  const canSave = useRef(false);

  const replaceSession = useCallback((next: ReturnType<typeof createSession>) => {
    latest.current = next;
    setSession(next);
  }, []);

  const addReceipt = useCallback((receipt: string) => {
    setReceipts((items) => [receipt, ...items].slice(0, RECEIPT_LIMIT));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = repository.load();
        if (saved) {
          replaceSession(createSession(saved));
          setSaveStatus("Saved on this device");
        } else {
          setSaveStatus("Example · not saved yet");
        }
        canSave.current = true;
      } catch {
        setError(
          "The saved draft could not be opened. It has been left untouched. You can edit and download this example, or open a valid score file.",
        );
        setSaveStatus("Local save unavailable");
      }
      setLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [repository, replaceSession]);

  const persist = useCallback(
    (score: Score) => {
      if (!canSave.current) return;
      try {
        repository.save(score);
        setSaveStatus("Saved on this device");
      } catch {
        setSaveStatus("Not saved on this device");
      }
    },
    [repository],
  );

  const commit: CommitEdit = useCallback(
    (operation, receipt, expectedRevision, requestId) => {
      if (!ready) return;
      try {
        const previous = latest.current.score;
        const next = execute(latest.current, {
          requestId: requestId ?? crypto.randomUUID(),
          expectedRevision: expectedRevision ?? previous.revision,
          operation,
        });
        onBeforeEdit();
        replaceSession(next);
        setSelectedId((id) => selectionAfterEdit(previous, next.score, id));
        setError(null);
        addReceipt(receipt);
        persist(next.score);
      } catch (error) {
        setError(error instanceof Error ? error.message : "The edit could not be applied.");
      }
    },
    [addReceipt, onBeforeEdit, persist, ready, replaceSession, setSelectedId],
  );

  /**
   * Replays commands made elsewhere (an assistant turn) as one undo step. Returns false, leaving
   * the score untouched, if they no longer apply, e.g. because the musician edited meanwhile.
   */
  const applyCommands = useCallback(
    (commands: Command[], receipt: string): boolean => {
      try {
        const previous = latest.current.score;
        const next = executeAll(latest.current, commands);
        onBeforeEdit();
        replaceSession(next);
        setSelectedId((id) => selectionAfterEdit(previous, next.score, id));
        addReceipt(receipt);
        persist(next.score);
        return true;
      } catch {
        return false;
      }
    },
    [addReceipt, onBeforeEdit, persist, replaceSession, setSelectedId],
  );

  const undoRedo = useCallback(
    (direction: "undo" | "redo") => {
      if (!ready) return;
      const next = travel(latest.current, direction);
      if (next === latest.current) return;
      onBeforeEdit();
      replaceSession(next);
      persist(next.score);
      setError(null);
      addReceipt(direction === "undo" ? "Undid the last edit" : "Restored the last edit");
    },
    [addReceipt, onBeforeEdit, persist, ready, replaceSession],
  );

  /**
   * Starts a new, blank song. The old one is gone for good: undo history and receipts start
   * afresh, so this is for a deliberate "start over", not an edit.
   */
  const startOver = useCallback(() => {
    if (!ready) return;
    const current = latest.current;
    const { score } = execute(current, {
      requestId: crypto.randomUUID(),
      expectedRevision: current.score.revision,
      operation: { type: "newScore" },
    });
    onBeforeEdit();
    replaceSession(createSession(score));
    clear();
    setReceipts([]);
    setError(null);
    persist(score);
  }, [clear, onBeforeEdit, persist, ready, replaceSession]);

  const notes = useNoteCommands(latestScore, commit, { selectedId, selectedHead: sheetSelection.selectedHead, select });

  const deleteItem = (item: SheetItem) => {
    commit(removeItemOperation(item), "Removed");
    selectItem(null);
  };

  /** Deletes a bar; the last remaining bar is cleared instead. A bar in one instrument's lane is cleared there. */
  const deleteBar = (measureId: string, staffId?: string) => {
    const lastBar = latest.current.score.measures.length === 1;
    if (staffId || lastBar) commit({ type: "clearMeasure", measureId, staffId }, "Cleared bar");
    else commit({ type: "deleteMeasure", measureId }, "Deleted bar");
  };

  const selection = findSelection(session.score, selectedId);
  const selectedBar = session.score.measures.some((m) => m.id === selectedBarId) ? selectedBarId : null;
  return {
    score: session.score,
    selection,
    selectedId: selection?.event.id ?? null,
    select,
    /** Everything picked on the sheet, in pick order; the last is the primary selection. */
    picked: sheetSelection.picked,
    pickedName: sheetSelection.pickedName,
    pick: sheetSelection.pick,
    focusEvent: sheetSelection.focusEvent,
    selectedBarId: selectedBar,
    selectedStaffId: selectedBar ? sheetSelection.selectedStaffId : null,
    selectBar,
    deleteBar,
    selectedItem,
    selectItem,
    deleteItem,
    /** The score is open; `ready` adds that nothing has locked editing. */
    loaded,
    ready,
    /** Locks (or unlocks) every edit from the sheet and toolbar; commands from an assistant turn still apply. */
    lock: setLocked,
    saveStatus,
    error,
    setError,
    receipts,
    commit,
    applyCommands,
    /** The latest score, including edits not yet rendered. */
    getScore: latestScore,
    ...notes,
    /** The head picked on the selected note's stem (a note of a chord, a drum piece), or null. */
    selectedHead: sheetSelection.selectedHead,
    undoRedo,
    startOver,
    canUndo: session.past.length > 0,
    canRedo: session.future.length > 0,
  };
}
