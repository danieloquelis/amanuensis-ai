import styles from "./switch.module.css";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What it turns on, for screen readers when no visible label wraps it. */
  label?: string;
};

/** An on/off switch, the kind phones use: a track with a knob that slides across when on. */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={styles.switch}
      checked={checked}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
