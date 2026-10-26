"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { beats, durationNotation, meterName, movePitch, pitchName, type Pitch, type Score } from "@/modules/score";
import { layoutScore, type EngravedEvent } from "../domain/layout";
import { DurationButtons, SheetContextMenu, type SheetCommit, type SheetTarget } from "@/modules/editor/ui/SheetActions";
import styles from "./score-surface.module.css";

function Clef({ top }: { top: number }) {
  // Original vector geometry; the engraving surface has no font or renderer dependency.
  return <g transform={`translate(55 ${top})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 9 36 C -8 26, 0 10, 10 1 C 22 -10, 24 -29, 16 -35 C 7 -29, 8 -13, 12 2 L 23 61 C 26 77, 8 81, 4 70" strokeWidth="2.6" />
    <path d="M 12 2 C 10 11, -10 22, -9 36 C -8 57, 28 61, 29 41 C 29 23, 5 20, 4 36 C 3 43, 10 48, 16 44" strokeWidth="3.8" />
    <ellipse cx="6" cy="69" rx="4.5" ry="5.5" fill="currentColor" stroke="none" />
  </g>;
}

function Accidental({ value, x, y }: { value: number; x: number; y: number }) {
  return <g transform={`translate(${x - 22} ${y})`} stroke="currentColor" fill="none" strokeWidth="1.5">
    {value === 1 ? <><path d="M 1 -12 V 12 M 7 -14 V 10" /><path d="M -3 -4 L 11 -7 M -3 5 L 11 2" strokeWidth="3.5" /></> : value === -1 ? <path d="M 0 -19 V 9 C 15 1, 11 -10, 0 -2" strokeWidth="2" /> : <><path d="M 0 -14 V 7 L 7 4 V -8 L 0 -5 M 7 4 V 14" /><path d="M 0 -5 L 7 -8 M 0 7 L 7 4" strokeWidth="3" /></>}
  </g>;
}

function Rest({ item }: { item: EngravedEvent }) {
  const value = item.event.measureRest ? 4 : durationNotation(item.event.duration).base;
  const { x, y } = item;
  if (value >= 2) return <rect x={x - 7} y={y + (value === 4 ? -12 : -6)} width="14" height="6" fill="currentColor" />;
  if (value <= 0.5) return <g stroke="currentColor" fill="currentColor"><circle cx={x - 3} cy={y - 4} r="3.5" />{value === 0.25 && <circle cx={x - 6} cy={y + 4} r="3.5" />}<path d={`M ${x - 3} ${y - 4} Q ${x + 2} ${y + 1} ${x + 7} ${y - 7} L ${x + 1} ${y + 15}`} fill="none" strokeWidth="2" /></g>;
  return <path d={`M ${x - 4} ${y - 15} L ${x + 5} ${y - 6} L ${x} ${y + 2} L ${x + 5} ${y + 10} Q ${x - 9} ${y + 4} ${x - 2} ${y + 17} Q ${x - 13} ${y + 7} ${x - 4} ${y + 4} L ${x - 9} ${y - 3} L ${x - 3} ${y - 10} Z`} fill="currentColor" />;
}

type Gesture =
  | { kind: "note"; id: string; measureId: string; startX: number; startY: number; pitch: Pitch | null; delta: number; axis: "x" | "y" | null; beforeId: string | null; originalBeforeId: string | null; positions: { id: string; x: number }[]; revision: number }
  | { kind: "bar"; id: string; startX: number; width: number; nextWidth: number; revision: number };
type Preview = { kind: "pitch"; id: string; delta: number } | { kind: "order"; id: string; measureId: string; beforeId: string | null; x: number } | { kind: "width"; id: string; width: number };

export function ScoreSurface({ score, selectedId, playBeat, onSelect, onCommand, onStep, onDelete, interactive }: {
  score: Score; selectedId: string | null; playBeat: number | null; interactive: boolean;
  onSelect: (id: string | null) => void; onCommand: SheetCommit;
  onStep: (id: string, steps: number) => void; onDelete: (id: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [context, setContext] = useState<SheetTarget | null>(null);
  const closeContext = useCallback(() => setContext(null), []);
  const cancelGesture = useCallback(() => { drag.current = null; setPreview(null); }, []);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === "Escape") { cancelGesture(); closeContext(); } };
    window.addEventListener("keydown", cancel);
    window.addEventListener("blur", cancelGesture);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", cancelGesture); };
  }, [cancelGesture, closeContext]);
  const previewScore = preview ? structuredClone(score) : score;
  if (preview?.kind === "pitch") {
    const event = previewScore.measures.flatMap((m) => m.events).find((e) => e.id === preview.id);
    if (event?.pitch) event.pitch = movePitch(event.pitch, preview.delta);
  } else if (preview?.kind === "width") {
    const measure = previewScore.measures.find((m) => m.id === preview.id);
    if (measure) measure.width = preview.width;
  } else if (preview?.kind === "order") {
    const measure = previewScore.measures.find((m) => m.id === preview.measureId);
    const event = measure?.events.find((e) => e.id === preview.id);
    if (measure && event) {
      measure.events = measure.events.filter((e) => e.id !== event.id);
      const index = preview.beforeId ? measure.events.findIndex((e) => e.id === preview.beforeId) : measure.events.length;
      measure.events.splice(Math.max(0, index), 0, event);
    }
  }
  const scene = layoutScore(previewScore);
  // Keep captured DOM nodes in their original order while previewing new positions.
  const eventOrder = new Map(score.measures.flatMap((m) => m.events).map((event, index) => [event.id, index]));
  const localPoint = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : new DOMPoint(clientX, clientY);
  };
  const finishGesture = () => {
    const gesture = drag.current;
    if (gesture?.kind === "bar" && gesture.width !== gesture.nextWidth) onCommand({ type: "setMeasureWidth", measureId: gesture.id, width: gesture.nextWidth }, "Adjusted bar spacing", gesture.revision);
    if (gesture?.kind === "note") {
      if (gesture.axis === "y" && gesture.delta && gesture.pitch) onCommand({ type: "setPitch", eventId: gesture.id, pitch: movePitch(gesture.pitch, gesture.delta) }, "Moved note pitch", gesture.revision);
      if (gesture.axis === "x" && gesture.beforeId !== gesture.originalBeforeId) onCommand({ type: "moveEvent", eventId: gesture.id, beforeEventId: gesture.beforeId }, "Moved note within bar", gesture.revision);
    }
    cancelGesture();
  };
  const openContext = (kind: SheetTarget["kind"], id: string, x: number, y: number) => {
    if (!interactive) return;
    cancelGesture();
    setContext({ kind, id, x, y });
  };
  return <div className={styles.sheet}>
    <svg ref={svg} className={styles.surface} viewBox={`0 0 ${scene.width} ${scene.height}`} aria-label={`${score.title}, treble clef, C major, ${score.measures.map((m) => meterName(m.meter)).join(", ")} meter. Select a note to edit.`}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); closeContext(); } }}>
    <title>{`${score.title} — editable score`}</title>
    {scene.systems.map((system) => <g key={system.firstMeasure}>
      {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="35" x2="846" y1={system.top + line * 12} y2={system.top + line * 12} className={styles.staff} />)}
      <Clef top={system.top} />
      {system.bars.map((bar, i) => <g key={bar.id} onContextMenu={(e) => { e.preventDefault(); openContext("bar", bar.id, e.clientX, e.clientY); }}>
        <text x={bar.x + 8} y={system.top - 34} className={styles.barNumber} role="button" tabIndex={0} aria-label={`Select bar ${bar.number}`} onContextMenu={(e) => { e.preventDefault(); openContext("bar", bar.id, e.clientX, e.clientY); }} onClick={() => onSelect(score.measures[bar.number - 1].events[0].id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(score.measures[bar.number - 1].events[0].id); }}>{String(bar.number).padStart(2, "0")}</text>
        {bar.showMeter && <g fontFamily="Georgia, serif" fontWeight="bold" fontSize="27" textAnchor="middle" fill="currentColor" className={styles.meter} role="button" tabIndex={0} onClick={(e) => { onSelect(score.measures[bar.number - 1].events[0].id); openContext("bar", bar.id, e.clientX, e.clientY); }} onContextMenu={(e) => { e.preventDefault(); openContext("bar", bar.id, e.clientX, e.clientY); }} onKeyDown={(e) => { if (e.key === "Enter") { const r = e.currentTarget.getBoundingClientRect(); openContext("bar", bar.id, r.right, r.bottom); } }} aria-label={`Time signature ${meterName(bar.meter)} at bar ${bar.number}`}><text x={i === 0 ? 94 : bar.x + 22} y={system.top + 23}>{bar.meter.numerator}</text><text x={i === 0 ? 94 : bar.x + 22} y={system.top + 47}>{bar.meter.denominator}</text></g>}
        <line x1={bar.endX} x2={bar.endX} y1={system.top} y2={system.top + 48} className={styles.barline} />
        <g className={i === 0 && system.bars.length === 2 ? styles.divider : styles.barTarget} role={i === 0 && system.bars.length === 2 ? "slider" : "button"} tabIndex={0}
          aria-label={i === 0 && system.bars.length === 2 ? `Resize bar ${bar.number}` : `Bar ${bar.number} actions`}
          aria-valuemin={i === 0 ? 260 : undefined} aria-valuemax={i === 0 ? 468 : undefined} aria-valuenow={i === 0 ? score.measures[bar.number - 1].width ?? 364 : undefined}
          onContextMenu={(e) => { e.preventDefault(); onSelect(score.measures[bar.number - 1].events[0].id); openContext("bar", bar.id, e.clientX, e.clientY); }}
          onDoubleClick={() => onCommand({ type: "setMeasureWidth", measureId: bar.id, width: null }, "Reset bar spacing")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); openContext("bar", bar.id, r.right, r.top); }
            if (i === 0 && system.bars.length === 2 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); onCommand({ type: "setMeasureWidth", measureId: bar.id, width: Math.max(260, Math.min(468, (score.measures[bar.number - 1].width ?? 364) + (e.key === "ArrowRight" ? 8 : -8))) }, "Adjusted bar spacing"); }
          }}
          onPointerDown={(e) => {
            if (!interactive || e.button !== 0 || i !== 0 || system.bars.length !== 2) return;
            closeContext(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
            const width = score.measures[bar.number - 1].width ?? 364;
            drag.current = { kind: "bar", id: bar.id, width, nextWidth: width, startX: localPoint(e.clientX, e.clientY).x, revision: score.revision };
          }}
          onPointerMove={(e) => {
            const gesture = drag.current;
            if (gesture?.kind !== "bar" || gesture.id !== bar.id) return;
            gesture.nextWidth = Math.max(260, Math.min(468, Math.round(gesture.width + localPoint(e.clientX, e.clientY).x - gesture.startX)));
            setPreview({ kind: "width", id: bar.id, width: gesture.nextWidth });
          }} onPointerUp={finishGesture} onPointerCancel={cancelGesture}>
          <rect x={bar.endX - 9} y={system.top - 8} width="18" height="64" fill="transparent" />
          <line x1={bar.endX} x2={bar.endX} y1={system.top - 6} y2={system.top + 54} className={styles.dividerHighlight} />
        </g>
        {bar.tempo && <text x={bar.notesX} y={system.top - 16} fontSize="11">{`♩ = ${bar.tempo}`}</text>}
        {bar.repeatStart && <g aria-label={`Repeat starts at bar ${bar.number}`}>
          <line x1={bar.x - 5} x2={bar.x - 5} y1={system.top} y2={system.top + 48} stroke="currentColor" strokeWidth="3" />
          <line x1={bar.x} x2={bar.x} y1={system.top} y2={system.top + 48} stroke="currentColor" />
          {[18, 30].map((dy) => <circle key={dy} cx={bar.x + 6} cy={system.top + dy} r="2" fill="currentColor" />)}
        </g>}
        {bar.repeatEnd && <g aria-label={`Repeat ends at bar ${bar.number}, ${bar.repeatEnd} passes`}>
          <line x1={bar.endX - 5} x2={bar.endX - 5} y1={system.top} y2={system.top + 48} stroke="currentColor" />
          <line x1={bar.endX} x2={bar.endX} y1={system.top} y2={system.top + 48} stroke="currentColor" strokeWidth="3" />
          {[18, 30].map((dy) => <circle key={dy} cx={bar.endX - 12} cy={system.top + dy} r="2" fill="currentColor" />)}
          <text x={bar.endX - 20} y={system.top - 16} fontSize="11">{`${bar.repeatEnd}×`}</text>
        </g>}
      </g>)}
      {[...system.events].sort((a, b) => eventOrder.get(a.event.id)! - eventOrder.get(b.event.id)!).map((item) => {
        const { event, x } = item;
        const notation = durationNotation(event.duration);
        const selected = selectedId === event.id;
        const sounding = playBeat !== null && playBeat >= item.beat && playBeat < item.beat + beats(event.duration);
        const stemX = x + (item.stemDown ? -6 : 6);
        return <g key={event.id} className={`${styles.event} ${selected ? styles.selected : ""} ${sounding ? styles.sounding : ""}`} role="button" tabIndex={0}
          aria-label={`Bar ${item.measure + 1}, beat ${item.localBeat + 1}, ${event.gap ? "Empty space" : pitchName(event.pitch)}, ${beats(event.duration)} beats`}
          aria-pressed={selected}
          onFocus={() => onSelect(event.id)}
          onContextMenu={(e) => { e.preventDefault(); onSelect(event.id); openContext("note", event.id, e.clientX, e.clientY); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onStep(event.id, e.key === "ArrowUp" ? 1 : -1); }
            if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDelete(event.id); }
            if (e.key === "Enter" || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); onSelect(event.id); const r = e.currentTarget.getBoundingClientRect(); openContext("note", event.id, r.right, r.top); }
            if (e.key === " ") { e.preventDefault(); onSelect(event.id); }
            if (e.key === "Escape") { onSelect(null); cancelGesture(); }
          }}
          onPointerDown={(e) => {
            if (!interactive || e.button !== 0) return;
            closeContext(); onSelect(event.id); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
            const point = localPoint(e.clientX, e.clientY);
            const positions = system.events.filter((n) => n.measure === item.measure && n.event.id !== event.id).map((n) => ({ id: n.event.id, x: n.x }));
            const events = score.measures[item.measure].events;
            const beforeId = events[events.findIndex((n) => n.id === event.id) + 1]?.id ?? null;
            drag.current = { kind: "note", id: event.id, measureId: score.measures[item.measure].id, startX: point.x, startY: point.y, pitch: event.pitch, delta: 0, axis: null, beforeId, originalBeforeId: beforeId, positions, revision: score.revision };
          }}
          onPointerMove={(e) => {
            const gesture = drag.current;
            if (gesture?.kind !== "note" || gesture.id !== event.id) return;
            const point = localPoint(e.clientX, e.clientY);
            const dx = point.x - gesture.startX, dy = point.y - gesture.startY;
            if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 4) gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            if (gesture.axis === "y" && gesture.pitch) {
              const delta = Math.round(-dy / 6), pitch = movePitch(gesture.pitch, delta);
              if (pitch.octave < 3 || pitch.octave > 6) return;
              gesture.delta = delta; setPreview({ kind: "pitch", id: event.id, delta });
            } else if (gesture.axis === "x") {
              gesture.beforeId = gesture.positions.find((n) => point.x < n.x)?.id ?? null;
              setPreview({ kind: "order", id: event.id, measureId: gesture.measureId, beforeId: gesture.beforeId, x: point.x });
            }
          }} onPointerUp={finishGesture} onPointerCancel={cancelGesture}>
          <rect className={styles.hit} x={x - 19} y={item.y - 25} width="38" height="50" rx="8" />
          <g pointerEvents="none">
            {selected && <ellipse className={styles.halo} cx={x} cy={item.y} rx="18" ry="15" />}
            {item.ledgerLines.map((y) => <line key={y} x1={x - 13} x2={x + 13} y1={y} y2={y} stroke="currentColor" strokeWidth="1.1" />)}
            {event.gap ? <g className={styles.emptySpace}><circle cx={x} cy={item.y} r="9" /><path d={`M ${x - 4} ${item.y} H ${x + 4} M ${x} ${item.y - 4} V ${item.y + 4}`} /></g> : event.pitch ? <>
              {item.accidental !== null && <Accidental value={item.accidental} x={x} y={item.y} />}
              <ellipse cx={x} cy={item.y} rx={notation.base === 4 ? 9 : 7.5} ry="5.1" transform={`rotate(-20 ${x} ${item.y})`} fill={notation.base >= 2 ? "var(--paper)" : "currentColor"} stroke="currentColor" strokeWidth={notation.base >= 2 ? 2.1 : 0.8} />
              {notation.base < 4 && <line x1={stemX} x2={stemX} y1={item.y} y2={item.stemEnd} stroke="currentColor" strokeWidth="1.5" />}
              {notation.base <= 0.5 && !system.beamedIds.includes(event.id) && <path transform={`translate(${stemX} ${item.stemEnd}) scale(${item.stemDown ? -1 : 1})`} d="M 0 0 C 18 10 16 24 7 29 C 14 14 4 13 0 9 Z" fill="currentColor" />}
              {notation.base === 0.25 && !system.beamedIds.includes(event.id) && <path transform={`translate(${stemX} ${item.stemEnd + (item.stemDown ? -7 : 7)}) scale(${item.stemDown ? -1 : 1})`} d="M 0 0 C 18 10 16 24 7 29 C 14 14 4 13 0 9 Z" fill="currentColor" />}
            </> : <Rest item={item} />}
            {notation.dotted && !event.measureRest && <circle cx={x + 14} cy={item.y - (item.y % 12 === system.top % 12 ? 5 : 0)} r="2" fill="currentColor" />}
            {event.articulation && <g transform={`translate(${x} ${Math.min(item.y - 18, system.top - 12)})`} aria-label={event.articulation}>
              {event.articulation === "staccato" && <circle r="2.5" fill="currentColor" />}
              {event.articulation === "accent" && <path d="M -7 -4 L 7 0 L -7 4" stroke="currentColor" fill="none" strokeWidth="1.5" />}
              {event.articulation === "tenuto" && <path d="M -6 0 H 6" stroke="currentColor" strokeWidth="1.5" />}
              {event.articulation === "fermata" && <><path d="M -9 0 Q 0 -16 9 0" stroke="currentColor" fill="none" strokeWidth="1.5" /><circle cy="-2" r="2" fill="currentColor" /></>}
            </g>}
          </g>
        </g>;
      })}
      {system.beams.map((beam) => <line key={`${beam.x1}-${beam.level}`} x1={beam.x1} x2={beam.x2} y1={beam.y} y2={beam.y} stroke="currentColor" strokeWidth="4" pointerEvents="none" />)}
      {system.labels.map((label) => <text key={label.id} className={styles.annotation} role="button" tabIndex={0} aria-label={`Edit indication ${label.text}`} onDoubleClick={(e) => openContext("annotation", label.annotationId, e.clientX, e.clientY)} onContextMenu={(e) => { e.preventDefault(); openContext("annotation", label.annotationId, e.clientX, e.clientY); }} onKeyDown={(e) => { if (e.key === "Enter") { const r = e.currentTarget.getBoundingClientRect(); openContext("annotation", label.annotationId, r.right, r.bottom); } }} x={label.x} y={label.y} fontFamily="Georgia, serif" fontStyle="italic" fontWeight={label.kind === "dynamic" ? "bold" : "normal"} fontSize={label.kind === "dynamic" ? 18 : 12}>{label.text}</text>)}
      {!preview && !context && interactive && system.events.filter((item) => item.event.id === selectedId).map((item) => <foreignObject key={`actions-${item.event.id}`} x={Math.max(35, Math.min(620, item.x - 98))} y={Math.max(system.top + 78, item.y + 23)} width="232" height="44" className={styles.quickActions}>
        <div className={styles.quickBar} role="toolbar" aria-label="Selected note actions" onKeyDown={(e) => { if (e.key === "Escape") { onSelect(null); e.stopPropagation(); } }} onPointerDown={(e) => e.stopPropagation()}>
          <DurationButtons event={item.event} onCommand={onCommand} />
          <button aria-label="More note actions" title="More · right-click note" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openContext("note", item.event.id, r.left, r.bottom + 4); }}>···</button>
        </div>
      </foreignObject>)}
      {playBeat !== null && system.bars.filter((bar) => playBeat >= bar.beat && playBeat < bar.beat + bar.capacity).map((bar) => <line key={bar.id} className={styles.playhead} x1={bar.notesX + (playBeat - bar.beat) * bar.unit} x2={bar.notesX + (playBeat - bar.beat) * bar.unit} y1={system.top - 20} y2={system.top + 78} />)}
    </g>)}
  </svg>
    {context && <SheetContextMenu key={`${context.kind}-${context.id}`} target={context} score={score} onCommand={onCommand} onClose={closeContext} />}
  </div>;
}
