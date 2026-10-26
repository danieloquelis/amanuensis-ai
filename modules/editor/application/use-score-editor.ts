"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createExample, createSession, execute, locateEvent, movePitch, parseScore, pitchName, travel, type Operation, type Score } from "@/modules/score";
import type { ProjectRepository } from "@/modules/projects/application/project-repository";

export function useScoreEditor(onBeforeEdit: () => void, repository: ProjectRepository) {
  const [session, setSession] = useState(() => createSession(createExample()));
  const current = useRef(session);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Opening local score…");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const canSave = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const score = repository.load();
        if (score) {
          const restored = createSession(score);
          current.current = restored;
          setSession(restored);
          setSaveStatus("Saved on this device");
        } else setSaveStatus("Example · not saved yet");
        canSave.current = true;
      } catch {
        setError("The saved draft could not be opened. It has been left untouched. You can edit and download this example, or open a valid score file.");
        setSaveStatus("Local save unavailable");
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [repository]);

  const persist = useCallback((score: Score) => {
    if (!canSave.current) return;
    try { repository.save(score); setSaveStatus("Saved on this device"); }
    catch { setSaveStatus("Not saved · download a copy"); }
  }, [repository]);

  const commit = useCallback((operation: Operation, receipt: string, expectedRevision?: number) => {
    if (!ready) return;
    try {
      const previous = current.current.score;
      const next = execute(current.current, { requestId: crypto.randomUUID(), expectedRevision: expectedRevision ?? current.current.score.revision, operation });
      onBeforeEdit();
      current.current = next;
      setSession(next);
      setSelectedId((id) => {
        if (!id || next.score.measures.some((m) => m.events.some((e) => e.id === id))) return id;
        const oldIndex = previous.measures.findIndex((m) => m.events.some((e) => e.id === id));
        const sameMeasure = next.score.measures.find((m) => m.id === previous.measures[oldIndex]?.id);
        return (sameMeasure ?? next.score.measures[Math.max(0, Math.min(oldIndex, next.score.measures.length - 1))]).events[0].id;
      });
      setError(null);
      setHistory((items) => [receipt, ...items].slice(0, 5));
      persist(next.score);
    } catch (error) { setError(error instanceof Error ? error.message : "The edit could not be applied."); }
  }, [onBeforeEdit, persist, ready]);

  const undoRedo = useCallback((direction: "undo" | "redo") => {
    if (!ready) return;
    const next = travel(current.current, direction);
    if (next === current.current) return;
    onBeforeEdit(); current.current = next; setSession(next); persist(next.score);
    setError(null);
    setHistory((items) => [direction === "undo" ? "Undid the last edit" : "Restored the last edit", ...items].slice(0, 5));
  }, [onBeforeEdit, persist, ready]);

  const replace = (value: unknown) => {
    const score = parseScore(value);
    onBeforeEdit();
    const next = createSession(score);
    current.current = next; setSession(next); setSelectedId(null); setError(null);
    canSave.current = true; persist(score); setHistory(["Opened score from file"]);
  };

  const step = (id: string, amount: number) => {
    const event = locateEvent(current.current.score, id).event;
    if (!event.pitch) return;
    const pitch = movePitch(event.pitch, amount);
    commit({ type: "setPitch", eventId: id, pitch }, `Changed ${pitchName(event.pitch)} to ${pitchName(pitch)}`);
  };

  const selection = session.score.measures.flatMap((measure, measureIndex) => measure.events.map((event) => ({ event, measureIndex }))).find(({ event }) => event.id === selectedId) ?? null;
  return { score: session.score, selection, selectedId: selection?.event.id ?? null, select: setSelectedId, ready, saveStatus, error, setError, history, commit, step, undoRedo, replace, canUndo: session.past.length > 0, canRedo: session.future.length > 0 };
}
