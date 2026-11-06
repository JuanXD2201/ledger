/** Descarga un texto como archivo, sin servidor. El BOM hace que Excel lea bien los acentos del CSV. */
export function downloadText(filename: string, content: string, mime: string, withBom = false): void {
  const blob = new Blob([withBom ? '﻿' : '', content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file, 'utf-8');
  });

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
