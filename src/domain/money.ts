export const MAX_AMOUNT = 1_000_000_000_000;

/**
 * Interpreta un monto escrito por una persona o venido de un CSV.
 * Acepta "1234567", "1.234.567", "1,234,567", "$ 85.000" y decimales de hasta
 * dos cifras ("1234,50"), que se redondean al peso. Rechaza vacíos, negativos y texto.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.replace(/[\s$]|COP/gi, '');
  if (text === '') return null;
  let value: number;
  if (/^\d+$/.test(text)) {
    value = Number(text);
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(text)) {
    value = Number(text.replace(/[.,]/g, ''));
  } else if (/^\d+[.,]\d{1,2}$/.test(text)) {
    value = Math.round(Number(text.replace(',', '.')));
  } else if (/^\d{1,3}([.,]\d{3})+[.,]\d{1,2}$/.test(text)) {
    const sep = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
    value = Math.round(Number(text.slice(0, sep).replace(/[.,]/g, '') + '.' + text.slice(sep + 1)));
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null;
  return value;
}
