import { IFRAME_ATTRS, isSafeImageSrc, isSafeVideoSrc, parseVideoUrl } from './media-urls';
import { ensureParagraphAfter } from './table';

export type MediaKind = 'image' | 'video';
export interface MediaUploadContext {
  kind: MediaKind;
}
export type UploadResult = string | { url: string };

/**
 * Decides where an uploaded file goes. Return the public URL (or `{ url }`).
 * Use one of the built-ins below, or write your own: `{ upload: async (file) => '...' }`.
 */
export interface MediaAdapter {
  upload(file: File, ctx: MediaUploadContext): Promise<UploadResult>;
}
export type MediaUploadFn = MediaAdapter['upload'];

export const resultUrl = (r: UploadResult): string => (typeof r === 'string' ? r : r.url);

const formatSize = (bytes: number) => (bytes >= 1048576 ? `${+(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

/** Embeds the file in the HTML as a data: URI. No server needed, but the HTML grows. Default: max 2 MB. */
export function base64Adapter(options: { maxSize?: number } = {}): MediaAdapter {
  const maxSize = options.maxSize ?? 2 * 1024 * 1024;
  return {
    upload: (file) =>
      new Promise((resolve, reject) => {
        if (file.size > maxSize) return reject(new Error(`File is too large (max ${formatSize(maxSize)}). Configure an upload adapter for bigger files.`));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
        reader.readAsDataURL(file);
      }),
  };
}

export interface EndpointOptions {
  /** Your upload API. Receives a multipart/form-data POST. */
  url: string;
  method?: string;
  /** Form field name for the file. Default 'file'. */
  fieldName?: string;
  /** Extra form fields. */
  fields?: Record<string, string>;
  /** Static headers, or a function returning them (for tokens). Don't set Content-Type. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  credentials?: RequestCredentials;
  /** Pick the file URL out of the JSON response. Default: `json.url`. */
  parse?: (json: any) => string;
}

/** Uploads to your own API with multipart/form-data and reads the URL from the JSON response. */
export function endpointAdapter(options: EndpointOptions): MediaAdapter {
  return {
    async upload(file) {
      const body = new FormData();
      for (const [k, v] of Object.entries(options.fields ?? {})) body.append(k, v);
      body.append(options.fieldName ?? 'file', file);
      const headers = typeof options.headers === 'function' ? await options.headers() : options.headers;
      const res = await fetch(options.url, { method: options.method ?? 'POST', body, headers, credentials: options.credentials });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const url = (options.parse ?? ((j) => j?.url))(await res.json());
      if (typeof url !== 'string' || !url) throw new Error('The upload response did not contain a URL');
      return url;
    },
  };
}

export interface PresignedTarget {
  uploadUrl: string;
  /** The URL the file will be reachable at afterwards. */
  publicUrl: string;
  method?: string;
  headers?: Record<string, string>;
}

/**
 * Direct-to-bucket upload (S3, Cloudflare R2, GCS, Azure...). Your backend signs a URL,
 * the browser PUTs the file to it, and the public URL goes into the document.
 */
export function presignedAdapter(options: {
  getUploadUrl: (file: File, ctx: MediaUploadContext) => Promise<PresignedTarget>;
}): MediaAdapter {
  return {
    async upload(file, ctx) {
      const target = await options.getUploadUrl(file, ctx);
      const res = await fetch(target.uploadUrl, {
        method: target.method ?? 'PUT',
        headers: { 'Content-Type': file.type, ...target.headers },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      return target.publicUrl;
    },
  };
}

// ---- the selected image ---------------------------------------------------------------------------------

/** The image that is currently selected as a whole (after clicking it), if any. */
export function selectedImage(): HTMLImageElement | null {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (r.startContainer !== r.endContainer || r.endOffset - r.startOffset !== 1) return null;
  const node = r.startContainer.childNodes[r.startOffset];
  return node instanceof HTMLImageElement && node.closest('.aurebesh-content') ? node : null;
}

const setStyles = (img: HTMLElement, styles: Record<string, string>): void => {
  for (const [prop, value] of Object.entries(styles)) {
    if (value) img.style.setProperty(prop, value);
    else img.style.removeProperty(prop);
  }
  if (!img.getAttribute('style')?.trim()) img.removeAttribute('style');
};

/** Width as a percentage of the editor (25, 50, 75, 100); an empty value restores the natural size. */
export function setImageWidth(percent: string): void {
  const img = selectedImage();
  if (!img) return;
  setStyles(img, { width: /^\d{1,3}$/.test(percent) ? `${percent}%` : '' });
}

/** 'left' | 'center' | 'right' put the image on its own line; anything else puts it back inline. */
export function setImageAlign(align: string): void {
  const img = selectedImage();
  if (!img) return;
  const margins: Record<string, [string, string]> = { left: ['0', 'auto'], center: ['auto', 'auto'], right: ['auto', '0'] };
  const m = margins[align];
  setStyles(img, { display: m ? 'block' : '', 'margin-left': m?.[0] ?? '', 'margin-right': m?.[1] ?? '' });
}

export function setImageAlt(alt: string): void {
  const img = selectedImage();
  if (!img) return;
  if (alt) img.setAttribute('alt', alt);
  else img.removeAttribute('alt');
}

// ---- inserting ------------------------------------------------------------------------------------------

export function insertImage(url: string, alt = ''): void {
  if (!isSafeImageSrc(url)) throw new Error('Unsupported image URL. Use an http(s):// link or an image file.');
  const img = document.createElement('img');
  img.setAttribute('src', url);
  if (alt) img.setAttribute('alt', alt);
  document.execCommand('insertHTML', false, img.outerHTML);
}

function insertBlock(inner: string): void {
  const sel = document.getSelection();
  const anchor = sel?.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement);
  const root = anchor?.closest('.aurebesh-content');
  if (!root) return;
  document.execCommand('insertHTML', false, `<div data-new>${inner}</div>`);
  const block = root.querySelector('[data-new]');
  if (!block) return;
  block.removeAttribute('data-new');
  ensureParagraphAfter(block);
}

const videoHtml = (src: string): string => {
  const v = document.createElement('video');
  v.setAttribute('src', src);
  v.setAttribute('controls', '');
  v.setAttribute('preload', 'metadata');
  return v.outerHTML;
};

/** A YouTube/Vimeo link becomes a privacy-friendly embed; a direct .mp4/.webm link becomes a <video>. */
export function insertVideo(url: string): void {
  const source = parseVideoUrl(url);
  if (!source) throw new Error('Unsupported video link. Use a YouTube or Vimeo link, or a direct .mp4/.webm URL.');
  if (source.kind === 'file') return insertBlock(videoHtml(source.src));
  // source.src is rebuilt from a validated id, so it is safe to put in the markup.
  const attrs = Object.entries(IFRAME_ATTRS).map(([k, v]) => (v ? `${k}="${v}"` : k)).join(' ');
  insertBlock(`<iframe src="${source.src}" ${attrs}></iframe>`);
}

/** Inserts a video from a known file URL (e.g. the result of an upload), without requiring a file extension. */
export function insertVideoFile(src: string): void {
  if (!isSafeVideoSrc(src)) throw new Error('Unsupported video URL.');
  insertBlock(videoHtml(src));
}
