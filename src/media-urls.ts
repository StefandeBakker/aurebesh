/** URL rules for images and videos. Shared by the sanitizer and the insert commands, so both agree on what is safe. */

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];

const HTTP = /^https?:\/\/[^\s"'<>]+$/i;
const SAME_SITE = /^\/(?!\/)[^\s"'<>]*$/;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/;
const DATA_VIDEO = /^data:video\/(?:mp4|webm);base64,[A-Za-z0-9+/=]+$/;

/** http(s), site-relative, or a base64 raster image. SVG is excluded on purpose. */
export const isSafeImageSrc = (url: string): boolean => HTTP.test(url) || SAME_SITE.test(url) || DATA_IMAGE.test(url);
export const isSafeVideoSrc = (url: string): boolean => HTTP.test(url) || SAME_SITE.test(url) || DATA_VIDEO.test(url);

// Only these exact embed URLs may become an <iframe>; everything else is removed.
const YOUTUBE_EMBED = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}$/;
const VIMEO_EMBED = /^https:\/\/player\.vimeo\.com\/video\/\d{1,12}(?:\?(?:h=\w{6,20}&)?dnt=1)?$/;
export const isEmbedSrc = (url: string): boolean => YOUTUBE_EMBED.test(url) || VIMEO_EMBED.test(url);

/** Attributes every embedded iframe gets, whatever it came with. */
export const IFRAME_ATTRS: Record<string, string> = {
  sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
  allowfullscreen: '',
  loading: 'lazy',
  referrerpolicy: 'strict-origin-when-cross-origin',
};

export type VideoSource = { kind: 'embed'; src: string } | { kind: 'file'; src: string };

/**
 * Turns a link a person pastes into something we can embed:
 * YouTube (via youtube-nocookie.com) and Vimeo (with do-not-track) become embeds,
 * a direct .mp4/.webm link becomes a <video>. Anything else is rejected.
 */
export function parseVideoUrl(input: string): VideoSource | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(?:www|m)\./, '');

  let id: string | undefined;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') ?? undefined;
    else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1];
  } else if (host === 'youtu.be') {
    id = url.pathname.slice(1, 12);
  }
  if (id && /^[\w-]{11}$/.test(id)) return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${id}` };

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/^\/(?:video\/)?(\d{1,12})(?:\/(\w{6,20}))?\/?$/);
    if (m) {
      const hash = m[2] ?? url.searchParams.get('h');
      const h = hash && /^\w{6,20}$/.test(hash) ? `h=${hash}&` : '';
      return { kind: 'embed', src: `https://player.vimeo.com/video/${m[1]}?${h}dnt=1` };
    }
  }

  if (/\.(?:mp4|webm)$/i.test(url.pathname) && isSafeVideoSrc(url.href)) return { kind: 'file', src: url.href };
  return null;
}
