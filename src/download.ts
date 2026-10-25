/** Hands a file to the person: the browser saves it (or asks where), under the name given. */
export function download(doc: Document, data: Blob | string, filename: string, type = 'application/octet-stream'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const win = doc.defaultView;
  const url = (win?.URL ?? URL).createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  // after the browser has taken it
  setTimeout(() => (win?.URL ?? URL).revokeObjectURL(url), 30_000);
}

import { strip } from './strings';

/** A name that a file can have: no path, no characters that a system refuses, and not empty. */
export function safeFilename(name: string | undefined, fallback = 'document'): string {
  const clean = (name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ');
  // the spaces are one each now: only a space and a dot are left to take off the ends
  const trimmed = strip(clean, '. ').slice(0, 120);
  return trimmed || fallback;
}
