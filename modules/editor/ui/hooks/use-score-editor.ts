import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectRepository } from "@/modules/projects";
import {
  createExample,
  createSession,
  execute,
  executeAll,
  locateEvent,
  parseScore,
  scoreKey,
  travel,
  type Command,
  type Operation,
  type Score,
  type Step,
} from "@/modules/score";
import { removeItemOperation, type SheetItem } from "../../application/notation-edits";
import { letterNoteEdit, stepPitchEdit, toggleRestOperation } from "../../application/note-edits";
import { findSelection, selectionAfterEdit } from "../../application/selection";
import { useSheetSelection } from "./use-sheet-selection";

const RECEIPT_LIMIT = 5;

export type CommitEdit = (operation: Operation, receipt: string, expectedRevision?: number) => void;
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
  const { selectedId, setSelectedId, selectedBarId, selectedItem, select, selectBar, selectItem, clear } =
    useSheetSelection();
  const [ready, setReady] = useState(false);
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
      setReady(true);
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
        setSaveStatus("Not saved · download a copy");
      }
    },
    [repository],
  );

  const commit: CommitEdit = useCallback(
    (operation, receipt, expectedRevision) => {
      if (!ready) return;
      try {
        const previous = latest.current.score;
        const next = execute(latest.current, {
          requestId: crypto.randomUUID(),
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

  /** Replaces the whole session with a validated score file. Throws if the file is invalid. */
  const openScore = (value: unknown) => {
    const score = parseScore(value);
    onBeforeEdit();
    replaceSession(createSession(score));
    clear();
    setError(null);
    canSave.current = true;
    persist(score);
    setReceipts(["Opened score from file"]);
  };

  /** A–G typed on a selected note or rest. */
  const enterLetter = (eventId: string, step: Step) => {
    const edit = letterNoteEdit(latest.current.score, eventId, step);
    commit(edit.operation, edit.receipt);
  };

  const toggleRest = (eventId: string) => {
    const score = latest.current.score;
    const { event } = locateEvent(score, eventId);
    commit(toggleRestOperation(event, scoreKey(score)), event.pitch ? "Replaced note with rest" : "Added note");
  };

  const stepPitch = (eventId: string, steps: number) => {
    const edit = stepPitchEdit(latest.current.score, eventId, steps);
    if (edit) commit(edit.operation, edit.receipt);
  };

  const deleteItem = (item: SheetItem) => {
    commit(removeItemOperation(item), "Removed");
    selectItem(null);
  };

  /** Deletes a bar; the last remaining bar is cleared instead. */
  const deleteBar = (measureId: string) => {
    const lastBar = latest.current.score.measures.length === 1;
    if (lastBar) commit({ type: "clearMeasure", measureId }, "Cleared bar");
    else commit({ type: "deleteMeasure", measureId }, "Deleted bar");
  };

  const selection = findSelection(session.score, selectedId);
  const selectedBar = session.score.measures.some((m) => m.id === selectedBarId) ? selectedBarId : null;
  return {
    score: session.score,
    selection,
    selectedId: selection?.event.id ?? null,
    select,
    selectedBarId: selectedBar,
    selectBar,
    deleteBar,
    selectedItem,
    selectItem,
    deleteItem,
    ready,
    saveStatus,
    error,
    setError,
    receipts,
    commit,
    applyCommands,
    /** The latest score, including edits not yet rendered. */
    getScore: () => latest.current.score,
    stepPitch,
    enterLetter,
    toggleRest,
    undoRedo,
    openScore,
    canUndo: session.past.length > 0,
    canRedo: session.future.length > 0,
  };
}
