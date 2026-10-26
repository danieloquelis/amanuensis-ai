/** Joins truthy class names: `classNames(styles.a, isOn && styles.b)`. */
export function classNames(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
