import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectRepository } from "@/modules/projects";
import { createExample, createSession, execute, parseScore, travel, type Operation, type Score } from "@/modules/score";
import { stepPitchEdit } from "../../application/note-edits";
import { findSelection, selectionAfterEdit } from "../../application/selection";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    [addReceipt, onBeforeEdit, persist, ready, replaceSession],
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
    setSelectedId(null);
    setError(null);
    canSave.current = true;
    persist(score);
    setReceipts(["Opened score from file"]);
  };

  const stepPitch = (eventId: string, steps: number) => {
    const edit = stepPitchEdit(latest.current.score, eventId, steps);
    if (edit) commit(edit.operation, edit.receipt);
  };

  const selection = findSelection(session.score, selectedId);
  return {
    score: session.score,
    selection,
    selectedId: selection?.event.id ?? null,
    select: setSelectedId,
    ready,
    saveStatus,
    error,
    setError,
    receipts,
    commit,
    stepPitch,
    undoRedo,
    openScore,
    canUndo: session.past.length > 0,
    canRedo: session.future.length > 0,
  };
}
