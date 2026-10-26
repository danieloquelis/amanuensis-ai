"use client";

import { useId, useState, type ReactNode } from "react";
import { applyCommand, DYNAMICS, METERS, meterName, pitchName, type Meter, type Operation, type Score, type ScoreEvent } from "@/modules/score";
import styles from "./score-tool-menus.module.css";

type Commit = (operation: Operation, receipt: string, expectedRevision?: number) => void;
type Selection = { event: ScoreEvent; measureIndex: number } | null;

function MeasureTools({ score, index, mode, onCommand, onError }: { score: Score; index: number; mode: "meter" | "repeat" | "bars"; onCommand: Commit; onError: (message: string) => void }) {
  const measure = score.measures[index];
  const [endIndex, setEndIndex] = useState(index);
  const [meter, setMeter] = useState(meterName(measure.meter));
  const [policy, setPolicy] = useState<"preserve" | "scale">("preserve");
  const [passes, setPasses] = useState(2);
  const [pending, setPending] = useState<{ operation: Operation; revision: number; description: string } | null>(null);
  const last = Math.max(index, Math.min(endIndex, score.measures.length - 1));
  const propose = (operation: Operation, description: string) => {
    try {
      applyCommand(score, { requestId: "ui-preview", expectedRevision: score.revision, operation });
      setPending({ operation, revision: score.revision, description });
    } catch (error) { setPending(null); onError(error instanceof Error ? error.message : "Cannot apply this change."); }
  };
  const repeat = score.repeats.find((r) => r.startMeasureId === measure.id);
  return <div onChange={() => setPending(null)}>
    {mode === "meter" && <section className={styles.section}>
      <h2>Time signature · bar {index + 1}</h2>
      <div className={styles.row}><label>Through bar<select aria-label="Range end bar" value={last} onChange={(e) => setEndIndex(Number(e.target.value))}>{score.measures.slice(index).map((m, i) => <option key={m.id} value={i + index}>{i + index + 1}</option>)}</select></label><label>Time signature<select aria-label="Time signature" value={meter} onChange={(e) => setMeter(e.target.value)}>{METERS.map((m) => <option key={m}>{m}</option>)}</select></label></div>
      <label>Existing rhythm<select aria-label="Meter change policy" value={policy} onChange={(e) => setPolicy(e.target.value as "preserve" | "scale")}><option value="preserve">Keep note durations</option><option value="scale">Fit rhythm proportionally</option></select></label>
      <p className={styles.hint}>{policy === "preserve" ? "Adds editable space or trims trailing rests. Never cuts a note." : "Changes note values to fit each bar. Unsupported tuplets are rejected."} Later bars keep their meter.</p>
      <button onClick={() => {
        const [numerator, denominator] = meter.split("/").map(Number);
        propose({ type: "setMeter", measureIds: score.measures.slice(index, last + 1).map((m) => m.id), meter: { numerator, denominator } as Meter, policy }, `Bars ${index + 1}–${last + 1}: ${meter} · ${policy === "scale" ? "fit rhythm" : "keep durations"}`);
      }}>Preview meter change</button>
      <div className={styles.row}><label>Tempo at this bar (♩ BPM)<input aria-label="Measure tempo" type="number" min={40} max={200} key={`${measure.id}-${measure.tempo}`} defaultValue={measure.tempo ?? ""} placeholder="Inherit" onBlur={(e) => { if (e.target.value) onCommand({ type: "setTempo", measureId: measure.id, tempo: Number(e.target.value) }, `Tempo at bar ${index + 1}: ${e.target.value} BPM`); }} /></label>{measure.tempo && <button onClick={() => onCommand({ type: "removeTempo", measureId: measure.id }, "Removed local tempo change")}>Remove</button>}</div>
    </section>}
    {mode === "repeat" && <section className={styles.section}>
      <h2>Repeat from bar {index + 1}</h2>
      <label>Through bar<select aria-label="Repeat end bar" value={last} onChange={(e) => setEndIndex(Number(e.target.value))}>{score.measures.slice(index).map((m, i) => <option key={m.id} value={i + index}>{i + index + 1}</option>)}</select></label>
      <div className={styles.row}><label>Total passes<select aria-label="Repeat passes" value={passes} onChange={(e) => setPasses(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label><button onClick={() => propose({ type: "putRepeat", ...(repeat ? { id: repeat.id } : {}), startMeasureId: measure.id, endMeasureId: score.measures[last].id, count: passes }, `Repeat bars ${index + 1}–${last + 1}, ${passes} passes`)}>Set repeat</button></div>
      {score.repeats.map((r) => <div className={styles.item} key={r.id}><span>Bars {score.measures.findIndex((m) => m.id === r.startMeasureId) + 1}–{score.measures.findIndex((m) => m.id === r.endMeasureId) + 1} · {r.count} passes</span><button aria-label="Remove repeat" onClick={() => onCommand({ type: "removeNotation", id: r.id }, "Removed repeat")}>Remove</button></div>)}
    </section>}
    {mode === "bars" && <section className={styles.section}>
      <h2>Bar {index + 1}</h2>
      <div className={styles.actions}><button onClick={() => onCommand({ type: "appendMeasure", afterMeasureId: measure.id }, `Inserted a bar after bar ${index + 1}`)}>Insert after</button><button onClick={() => onCommand({ type: "duplicateMeasure", measureId: measure.id }, `Duplicated bar ${index + 1}`)}>Duplicate</button><button onClick={() => propose({ type: "clearMeasure", measureId: measure.id }, `Replace bar ${index + 1} with rests`)}>Clear to rests</button><button disabled={score.measures.length === 1} onClick={() => propose({ type: "deleteMeasure", measureId: measure.id }, `Delete bar ${index + 1} and its anchored indications`)}>Delete bar</button></div>
    </section>}
    {pending && <div className={styles.preview} role="status"><strong>{pending.description}</strong>{pending.revision !== score.revision ? <p>Score changed. Preview again before applying.</p> : <p>One undoable edit. The original is unchanged until you apply.</p>}<div className={styles.actions}><button disabled={pending.revision !== score.revision} onClick={() => { onCommand(pending.operation, pending.description, pending.revision); setPending(null); }}>Apply change</button><button onClick={() => setPending(null)}>Cancel</button></div></div>}
  </div>;
}

function IndicationTools({ score, selection, measureIndex, mode, onCommand }: { score: Score; selection: Selection; measureIndex: number; mode: "dynamic" | "text"; onCommand: Commit }) {
  const measure = score.measures[measureIndex];
  const [target, setTarget] = useState<"note" | "bar">(selection ? "note" : "bar");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const targetId = target === "note" && selection ? selection.event.id : measure.id;
  const annotations = score.annotations.filter((a) => a.targetId === targetId);
  return <section className={styles.section}>
    <h2>{mode === "dynamic" ? "Dynamics" : "Text indication"} · {selection ? pitchName(selection.event.pitch) : `bar ${measureIndex + 1}`}</h2>
    <label>Anchor<select aria-label="Indication anchor" value={target} onChange={(e) => { setTarget(e.target.value as "note" | "bar"); setEditingId(null); setText(""); }}><option value="note" disabled={!selection}>Selected note / rest</option><option value="bar">Start of bar {measureIndex + 1}</option></select></label>
    {mode === "dynamic" && <div className={styles.dynamics}>{DYNAMICS.map((dynamic) => <button key={dynamic} aria-label={`Set dynamic ${dynamic}`} aria-pressed={annotations.some((a) => a.kind === "dynamic" && a.text === dynamic)} onClick={() => onCommand({ type: "putAnnotation", targetId, kind: "dynamic", text: dynamic }, `Set ${dynamic} at ${target === "note" ? "selection" : `bar ${measureIndex + 1}`}`)}>{dynamic}</button>)}</div>}
    {mode === "text" && <form onSubmit={(e) => { e.preventDefault(); onCommand({ type: "putAnnotation", ...(editingId ? { id: editingId } : {}), targetId, kind: "text", text }, editingId ? "Updated indication" : "Added text indication"); setText(""); setEditingId(null); }}>
      <label>Text indication<input aria-label="Text indication" placeholder="dolce, espressivo, breathe…" maxLength={120} required value={text} onChange={(e) => setText(e.target.value)} /></label>
      <button disabled={!text.trim()}>{editingId ? "Update text" : "Add text"}</button>
    </form>}

    {annotations.filter((a) => a.kind === mode).map((a) => <div className={styles.item} key={a.id}><span>{a.text}</span><div>{a.kind === "text" && <button onClick={() => { setEditingId(a.id); setText(a.text); }}>Edit</button>}<button aria-label={`Remove indication ${a.text}`} onClick={() => { onCommand({ type: "removeNotation", id: a.id }, "Removed indication"); if (editingId === a.id) { setEditingId(null); setText(""); } }}>Remove</button></div></div>)}
  </section>;
}

function ToolPopover({ label, accessibleLabel, disabled, children, wide = false }: { label: string; accessibleLabel: string; disabled?: boolean; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const [position, setPosition] = useState({ left: 12, top: 160 });
  return <>
    <button className={styles.trigger} popoverTarget={id} disabled={disabled} aria-label={accessibleLabel} title={accessibleLabel} aria-haspopup="dialog" onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - (wide ? 570 : 332))), top: rect.bottom + 8 });
    }}>{label}</button>
    <div id={id} popover="auto" role="dialog" aria-label={accessibleLabel} className={`${styles.popover} ${wide ? styles.wide : ""}`} style={position}>{children}</div>
  </>;
}

export function ScoreToolMenus({ score, selection, ready, onCommand, onError }: {
  score: Score; selection: Selection; ready: boolean; onCommand: Commit; onError: (message: string) => void;
}) {
  const index = selection?.measureIndex ?? 0;
  const measure = score.measures[index];
  return <div className={styles.tools} role="group" aria-label="Notation toolbar">
    <ToolPopover label={meterName(measure.meter)} accessibleLabel="Change time signature" disabled={!ready}>
      <MeasureTools key={`meter-${measure.id}`} score={score} index={index} mode="meter" onCommand={onCommand} onError={onError} />
    </ToolPopover>
    <ToolPopover label="ƒ" accessibleLabel="Dynamics" disabled={!ready}>
      <IndicationTools key={`dynamic-${selection?.event.id ?? measure.id}`} score={score} selection={selection} measureIndex={index} mode="dynamic" onCommand={onCommand} />
    </ToolPopover>
    <ToolPopover label="Text" accessibleLabel="Text indications" disabled={!ready}>
      <IndicationTools key={`text-${selection?.event.id ?? measure.id}`} score={score} selection={selection} measureIndex={index} mode="text" onCommand={onCommand} />
    </ToolPopover>
    <ToolPopover label=":‖" accessibleLabel="Repeats" disabled={!ready}>
      <MeasureTools key={`repeat-${measure.id}`} score={score} index={index} mode="repeat" onCommand={onCommand} onError={onError} />
    </ToolPopover>
    <ToolPopover label="+ Bar" accessibleLabel="Measure actions" disabled={!ready}>
      <MeasureTools key={`bars-${measure.id}`} score={score} index={index} mode="bars" onCommand={onCommand} onError={onError} />
    </ToolPopover>
  </div>;
}
