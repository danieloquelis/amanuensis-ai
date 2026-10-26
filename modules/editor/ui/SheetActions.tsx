"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { applyCommand, ARTICULATIONS, beats, DYNAMICS, durationNotation, meterName, pitchName, type Operation, type Score, type ScoreEvent } from "@/modules/score";
import styles from "./sheet-actions.module.css";

export type SheetTarget = { kind: "note" | "bar" | "annotation"; id: string; x: number; y: number };
export type SheetCommit = (operation: Operation, receipt: string, expectedRevision?: number) => void;
const values = [{ value: 4, label: "Whole" }, { value: 2, label: "Half" }, { value: 1, label: "Quarter" }, { value: 0.5, label: "Eighth" }, { value: 0.25, label: "Sixteenth" }] as const;

export function DurationButtons({ event, onCommand }: { event: ScoreEvent; onCommand: SheetCommit }) {
  const notation = durationNotation(event.duration);
  return <div className={styles.durations} role="group" aria-label="Note duration">
    {values.map(({ value, label }) => <button key={value} aria-label={`${label} duration`} title={label} aria-pressed={!event.measureRest && beats(event.duration) === value} onClick={() => onCommand({ type: "setDuration", eventId: event.id, duration: value }, `${label} duration`)}>
      <svg viewBox="0 0 26 32" width="20" height="26" aria-hidden="true"><ellipse cx="10" cy="23" rx={value === 4 ? 7 : 5.5} ry="3.7" transform="rotate(-20 10 23)" fill={value >= 2 ? "none" : "currentColor"} stroke="currentColor" strokeWidth="1.6" />{value < 4 && <path d="M15 22V3" stroke="currentColor" strokeWidth="1.4" />}{value <= 0.5 && <path d="M15 3 Q26 9 19 17 Q22 10 15 9Z" fill="currentColor" />}{value === 0.25 && <path d="M15 9 Q26 15 19 23 Q22 16 15 15Z" fill="currentColor" />}</svg>
    </button>)}
    <button aria-label="Dotted duration" title="Dotted duration" aria-pressed={notation.dotted && !event.measureRest} disabled={event.measureRest} onClick={() => onCommand({ type: "setDuration", eventId: event.id, duration: (notation.dotted ? notation.base : notation.base * 1.5) as 1.5 }, "Changed dotted duration")}><span className={styles.dot}>·</span></button>
  </div>;
}

export function restOperation(event: ScoreEvent): Operation {
  return event.measureRest ? { type: "batch", operations: [{ type: "setDuration", eventId: event.id, duration: 1 }, { type: "setPitch", eventId: event.id, pitch: { step: "C", octave: 4, alter: 0 } }] } : { type: "setPitch", eventId: event.id, pitch: event.pitch ? null : { step: "C", octave: 4, alter: 0 } };
}

export function SheetContextMenu({ target, score, onCommand, onClose }: { target: SheetTarget; score: Score; onCommand: SheetCommit; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [meterChoice, setMeterChoice] = useState<{ numerator: number; denominator: 4 | 8 } | null>(null);
  const [message, setMessage] = useState("");
  const annotation = score.annotations.find((a) => a.id === target.id);
  const [text, setText] = useState(annotation?.text ?? "");
  const measure = score.measures.find((m) => m.id === target.id || m.events.some((e) => e.id === target.id));
  const event = measure?.events.find((e) => e.id === target.id);
  const barIndex = measure ? score.measures.indexOf(measure) : -1;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const element = menu.current;
    element?.querySelector<HTMLElement>("button, input")?.focus();
    const dismiss = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) onClose(); };
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", dismiss); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", onClose); if (previouslyFocused?.isConnected && (document.activeElement === document.body || element?.contains(document.activeElement))) previouslyFocused.focus(); };
  }, [onClose]);
  const commit = (operation: Operation, receipt: string) => {
    try {
      applyCommand(score, { requestId: "sheet-preview", expectedRevision: score.revision, operation });
      onCommand(operation, receipt, score.revision); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to apply this edit."); }
  };
  if (!measure && !annotation) return null;
  return createPortal(<div ref={menu} role="dialog" aria-label={target.kind === "note" ? "Note actions" : target.kind === "bar" ? "Bar actions" : "Indication actions"} className={styles.menu}
    style={{ left: Math.max(8, Math.min(target.x, window.innerWidth - 272)), top: Math.max(8, Math.min(target.y, window.innerHeight - 390)) }}
    onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (["ArrowDown", "ArrowUp", "Tab"].includes(e.key) && !(e.target instanceof HTMLInputElement)) {
        const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        if (buttons.length) { e.preventDefault(); buttons[(index + (e.key === "ArrowUp" || e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus(); }
      }
    }}>
    <header><strong>{event ? `${event.gap ? "Empty space" : pitchName(event.pitch)} · Bar ${barIndex + 1}` : measure ? `Bar ${barIndex + 1} · ${meterName(measure.meter)}` : "Indication"}</strong><button aria-label="Close actions" onClick={onClose}>×</button></header>
    {event && <>
      <DurationButtons event={event} onCommand={commit} />
      {event.pitch && <div className={styles.row} role="group" aria-label="Accidental">{([-1, 0, 1] as const).map((alter, i) => <button key={alter} aria-label={["Flat", "Natural", "Sharp"][i]} title={["Flat", "Natural", "Sharp"][i]} aria-pressed={event.pitch!.alter === alter} onClick={() => commit({ type: "setPitch", eventId: event.id, pitch: { ...event.pitch!, alter } }, "Changed accidental")}>{["♭", "♮", "♯"][i]}</button>)}</div>}
      {!event.gap && <div className={styles.row} role="group" aria-label="Articulation">{ARTICULATIONS.filter((a) => event.pitch || a === "fermata").map((articulation, i) => <button key={articulation} aria-label={articulation} title={articulation} aria-pressed={event.articulation === articulation} onClick={() => commit({ type: "setArticulation", eventId: event.id, articulation: event.articulation === articulation ? null : articulation }, `Changed ${articulation}`)}>{event.pitch ? ["•", ">", "—", "𝄐"][i] : "𝄐"}</button>)}</div>}
      <button aria-label={event.pitch ? "Make rest" : "Add note"} className={styles.action} onClick={() => commit(restOperation(event), event.pitch ? "Replaced note with rest" : "Added note")}>{event.pitch ? "Make rest" : "Add note"}</button>
      {event.gap && <button className={styles.action} onClick={() => commit({ type: "setPitch", eventId: event.id, pitch: null }, "Added rest")}>Make rest</button>}
    </>}
    {target.kind === "bar" && measure && <>
      <div className={styles.meters} role="group" aria-label="Time signature">{[{ numerator: 2, denominator: 4 }, { numerator: 3, denominator: 4 }, { numerator: 4, denominator: 4 }, { numerator: 6, denominator: 8 }].map((meter) => <button key={meterName(meter as { numerator: number; denominator: 4 | 8 })} onClick={() => {
        const nextMeter = meter as { numerator: number; denominator: 4 | 8 };
        try { applyCommand(score, { requestId: "meter-preview", expectedRevision: score.revision, operation: { type: "setMeter", measureIds: [measure.id], meter: nextMeter, policy: "preserve" } }); commit({ type: "setMeter", measureIds: [measure.id], meter: nextMeter, policy: "preserve" }, "Changed bar meter"); }
        catch { setMeterChoice(nextMeter); setMessage("This bar contains more music than the new meter allows."); }
      }}>{meter.numerator}/{meter.denominator}</button>)}</div>
      {meterChoice && <button className={styles.action} onClick={() => commit({ type: "setMeter", measureIds: [measure.id], meter: meterChoice, policy: "scale" }, "Fit rhythm to new meter")}>Fit rhythm to {meterName(meterChoice)}</button>}
      <button className={styles.action} onClick={() => commit({ type: "appendMeasure", afterMeasureId: measure.id }, "Inserted measure")}>Insert bar after</button>
      <button className={styles.action} onClick={() => commit({ type: "duplicateMeasure", measureId: measure.id }, "Duplicated measure")}>Duplicate bar</button>
      <button className={styles.action} onClick={() => commit({ type: "clearMeasure", measureId: measure.id }, "Cleared measure to rests")}>Clear to rests</button>
      <button className={styles.action} disabled={score.measures.length === 1} onClick={() => commit({ type: "deleteMeasure", measureId: measure.id }, "Deleted measure")}>Delete bar</button>
      <button className={styles.action} onClick={() => commit({ type: "setMeasureWidth", measureId: measure.id, width: null }, "Reset bar spacing")}>Reset spacing</button>
    </>}
    {annotation && <>
      {annotation.kind === "text" ? <form onSubmit={(e) => { e.preventDefault(); commit({ type: "putAnnotation", ...annotation, text }, "Edited indication"); }}><input autoComplete="off" aria-label="Indication text" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} /><button className={styles.action} disabled={!text.trim()}>Save text</button></form> : <div className={styles.row}>{DYNAMICS.map((dynamic) => <button key={dynamic} onClick={() => commit({ type: "putAnnotation", ...annotation, text: dynamic }, "Changed dynamic")}>{dynamic}</button>)}</div>}
      <button className={styles.action} onClick={() => commit({ type: "removeNotation", id: annotation.id }, "Removed indication")}>Remove indication</button>
    </>}
    {message && <p role="status" className={styles.message}>{message}</p>}
  </div>, document.body);
}
