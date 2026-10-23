/**
 * A ZIP file written without a library: every file is stored as it is (a .docx is a ZIP of XML, which a word processor reads as it
 * is), with the CRC-32 and the central directory that the format asks for. Names are UTF-8.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

let table: Uint32Array | null = null;

/** The CRC-32 of some bytes. */
export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** The bytes of a text, as UTF-8. */
export const utf8 = (text: string): Uint8Array => encoder.encode(text);

/** DOS time and date, which a ZIP file has for each file (the time of the date given, in the local time zone). */
function dosTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** A ZIP file of the entries, in that order. */
export function zip(entries: ZipEntry[], date = new Date()): Uint8Array {
  const stamp = dosTime(date);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, entry.data);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); // central directory header
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, stamp.time, true);
    dv.setUint16(14, stamp.date, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true); // where the local header is
    dir.set(name, 46);
    central.push(dir);
    offset += local.length + size;
  }
  const directorySize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + end.length);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The entries of a ZIP file that was written by `zip` (stored, not compressed): for tests and for reading back what was made. */
export function unzip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a ZIP file');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Broken ZIP directory');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new Error('Only stored entries can be read');
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.push({ name, data: bytes.slice(dataAt, dataAt + size) });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

export interface UnzipLimits {
  /** The most files. Default: 5000. */
  maxEntries?: number;
  /** The most bytes of one file, as it is when it is read (a compressed file can be much larger than it looks). Default: 64 MB. */
  maxSize?: number;
  /** The most bytes of all the files together. Default: 256 MB. */
  maxTotal?: number;
}

/** The bytes of a piece of deflate-compressed data (a ZIP file has them without the zlib header). */
async function inflate(data: Uint8Array, max: number): Promise<Uint8Array> {
  const Decompress = (globalThis as { DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!Decompress) throw new Error('This browser cannot read compressed files');
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new Decompress('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new Error('A file in the ZIP is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * The files of any ZIP file (stored or deflated, which is what word processors make): by name. A name that is there twice has the
 * last one. Encrypted files and ZIP64 are not read. The limits keep a file that unpacks to something huge from filling the memory.
 */
export async function unzipAll(bytes: Uint8Array, limits: UnzipLimits = {}): Promise<Map<string, Uint8Array>> {
  const { maxEntries = 5000, maxSize = 64 * 1024 * 1024, maxTotal = 256 * 1024 * 1024 } = limits;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a ZIP file');
  const count = view.getUint16(end + 10, true);
  if (count === 0xffff || view.getUint32(end + 16, true) === 0xffffffff) throw new Error('A ZIP64 file cannot be read');
  if (count > maxEntries) throw new Error('The ZIP file has too many files');
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('Broken ZIP directory');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (name.endsWith('/')) continue; // a folder
    if (flags & 1) throw new Error('An encrypted ZIP file cannot be read');
    if (size > maxSize || packed > maxSize) throw new Error('A file in the ZIP is too large');
    if (local + 30 > bytes.length) throw new Error('Broken ZIP file');
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataAt + packed > bytes.length) throw new Error('Broken ZIP file');
    const raw = bytes.subarray(dataAt, dataAt + packed);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflate(raw, maxSize);
    else throw new Error(`A ZIP file with compression method ${method} cannot be read`);
    total += data.length;
    if (total > maxTotal) throw new Error('The files in the ZIP are too large together');
    out.set(name, data);
  }
  return out;
}
