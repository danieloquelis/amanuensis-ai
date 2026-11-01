import { CheckCircle, Circle, Lightbulb, Wrench } from "@phosphor-icons/react";
import type { PlanStep } from "../../application/agent-state";
import { readableThought, type WorkEntry } from "../../application/work-log";
import { stepLine } from "../hooks/use-activity-line";
import styles from "./assistant.module.css";

/** The agent's plan as a checklist: what is done, what is left. */
export function PlanChecklist({ steps }: { steps: PlanStep[] }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <div className={styles.plan}>
      <p className={styles.planTitle}>
        Plan · {done} of {steps.length}
      </p>
      <ul aria-label="Plan">
        {steps.map((step, i) => (
          <li key={i} data-done={step.done}>
            {step.done ? <CheckCircle size={15} weight="fill" /> : <Circle size={15} />}
            {step.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A thought's sentences: the summary streams in sentence by sentence. */
const sentencesOf = (text: string) =>
  readableThought(text)
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

/**
 * While it works: only its latest thought, the sentence being written, in at most two lines.
 * Each new sentence slides in over the last; everything is in the summary once it answers.
 */
export function LiveThought({ log }: { log: WorkEntry[] }) {
  const index = log.findLastIndex((entry) => entry.kind === "thought" && entry.text.trim());
  if (index === -1) return null;
  const sentences = sentencesOf((log[index] as Extract<WorkEntry, { kind: "thought" }>).text);
  const current = sentences.length - 1;
  return (
    <p key={`${index}-${current}`} className={styles.liveThought} aria-live="polite">
      <Lightbulb size={13} aria-hidden="true" />
      <span>{sentences[current]}</span>
    </p>
  );
}

/** Its thinking and steps, in order: thoughts as short paragraphs, each step as a line. */
export function WorkEntries({ log }: { log: WorkEntry[] }) {
  return (
    <ol className={styles.workLog}>
      {log.map((entry, i) =>
        entry.kind === "thought" ? (
          entry.text.trim() && (
            <li key={i} className={styles.thought}>
              <Lightbulb size={13} aria-hidden="true" />
              <span>{readableThought(entry.text.trim())}</span>
            </li>
          )
        ) : (
          <li key={i} className={styles.step}>
            <Wrench size={13} aria-hidden="true" />
            <span>{stepLine(entry.tool)}</span>
          </li>
        ),
      )}
    </ol>
  );
}

/**
 * After the answer: how the agent worked, folded away ("Thought for 34 s · 5 steps"); opened, its
 * thinking and steps in order.
 */
export function WorkSummary({ log, seconds }: { log: WorkEntry[]; seconds?: number }) {
  const steps = log.filter((entry) => entry.kind === "step").length;
  if (!log.length) return null;
  const took = seconds !== undefined ? `Thought for ${Math.max(1, Math.round(seconds))} s` : "How I worked";
  return (
    <details className={styles.workSummary}>
      <summary>
        {took}
        {steps ? ` · ${steps} step${steps > 1 ? "s" : ""}` : ""}
      </summary>
      <WorkEntries log={log} />
    </details>
  );
}
