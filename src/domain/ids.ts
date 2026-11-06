let counter = 0;

/** Identificador corto y único dentro del dispositivo. */
export function makeId(prefix: string): string {
  counter += 1;
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}${counter.toString(36)}`;
}
