import { describe, it, expect, vi, afterEach } from 'vitest';
import { base64Adapter, endpointAdapter, presignedAdapter, parseVideoUrl, sanitize, Aurebesh } from '../src';

afterEach(() => vi.unstubAllGlobals());

describe('parseVideoUrl', () => {
  it('turns YouTube links into privacy-friendly embeds', () => {
    const embed = { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' };
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toEqual(embed);
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual(embed);
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(embed);
  });
  it('turns Vimeo links into do-not-track embeds', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')).toEqual({ kind: 'embed', src: 'https://player.vimeo.com/video/76979871?dnt=1' });
    expect(parseVideoUrl('https://vimeo.com/76979871/abcdef1234')?.src).toBe('https://player.vimeo.com/video/76979871?h=abcdef1234&dnt=1');
  });
  it('accepts direct mp4/webm files and rejects everything else', () => {
    expect(parseVideoUrl('https://cdn.example.com/a/clip.mp4')).toEqual({ kind: 'file', src: 'https://cdn.example.com/a/clip.mp4' });
    expect(parseVideoUrl('https://example.com/page')).toBeNull();
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
    expect(parseVideoUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoUrl('not a url')).toBeNull();
  });
});

describe('sanitize media', () => {
  it('keeps safe images, drops unsafe ones', () => {
    expect(sanitize('<img src="https://x.dev/a.png" alt="a" onerror="x()">')).toBe('<img src="https://x.dev/a.png" alt="a">');
    expect(sanitize('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain('data:image/png;base64');
    expect(sanitize('<img src="javascript:alert(1)">')).toBe('');
    expect(sanitize('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).toBe('');
  });
  it('only lets exact YouTube/Vimeo embeds through as iframes, with fixed attributes', () => {
    const ok = sanitize('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" onload="x()" style="x:y"></iframe>');
    expect(ok).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(ok).toContain('sandbox=');
    expect(ok).not.toContain('onload');
    expect(sanitize('<iframe src="https://evil.com/embed/dQw4w9WgXcQ"></iframe>')).toBe('');
    expect(sanitize('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')).toBe('');
    expect(sanitize('<iframe srcdoc="<script>1</script>"></iframe>')).toBe('');
  });
  it('keeps videos with controls and drops unsafe sources', () => {
    expect(sanitize('<video src="https://x.dev/a.mp4" autoplay onplay="x()"></video>')).toBe(
      '<video src="https://x.dev/a.mp4" controls="" preload="metadata"></video>',
    );
    expect(sanitize('<video src="javascript:1"></video>')).toBe('');
  });
});

describe('upload adapters', () => {
  const file = (type = 'image/png', size = 4) => new File([new Uint8Array(size)], 'a.png', { type });

  it('base64 returns a data URI and enforces the size limit', async () => {
    expect(await base64Adapter().upload(file(), { kind: 'image' })).toMatch(/^data:image\/png;base64,/);
    await expect(base64Adapter({ maxSize: 2 }).upload(file(), { kind: 'image' })).rejects.toThrow(/too large/);
  });

  it('endpoint posts multipart and reads the url (custom parse supported)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { link: 'https://cdn.x/a.png' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const url = await endpointAdapter({
      url: '/api/upload',
      fieldName: 'image',
      fields: { folder: 'blog' },
      headers: () => ({ Authorization: 'Bearer t' }),
      parse: (j) => j.data.link,
    }).upload(file(), { kind: 'image' });
    expect(url).toBe('https://cdn.x/a.png');
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe('/api/upload');
    expect((init.body as FormData).get('folder')).toBe('blog');
    expect((init.body as FormData).get('image')).toBeInstanceOf(File);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('endpoint reports failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })));
    await expect(endpointAdapter({ url: '/x' }).upload(file(), { kind: 'image' })).rejects.toThrow(/500/);
  });

  it('presigned PUTs to the bucket and returns the public url', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const url = await presignedAdapter({
      getUploadUrl: async (f) => ({ uploadUrl: 'https://bucket.s3.amazonaws.com/k?sig=1', publicUrl: `https://cdn.x/${f.name}` }),
    }).upload(file(), { kind: 'image' });
    expect(url).toBe('https://cdn.x/a.png');
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toContain('bucket.s3.amazonaws.com');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });
});

describe('editor media', () => {
  it('uploadFiles sends the file through a plain-function adapter and inserts the result', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const upload = vi.fn(async () => 'https://cdn.x/pic.png');
    const ed = new Aurebesh(el, { value: '<p>hi</p>', media: { adapter: upload } });
    ed.focus();
    const p = ed.content.querySelector('p')!;
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    // jsdom has no execCommand: the insert itself is covered in the browser; here we check the adapter wiring + errors.
    document.execCommand = vi.fn(() => true) as typeof document.execCommand;
    await ed.uploadFiles([new File([new Uint8Array(2)], 'pic.png', { type: 'image/png' })]);
    expect(upload).toHaveBeenCalledOnce();
    expect(document.execCommand).toHaveBeenCalledWith('insertHTML', false, expect.stringContaining('https://cdn.x/pic.png'));
  });

  it('rejects unsupported types and emits error', async () => {
    const el = document.createElement('div');
    const ed = new Aurebesh(el);
    const errors: Error[] = [];
    ed.on('error', (e) => errors.push(e));
    await ed.uploadFiles([new File(['x'], 'a.exe', { type: 'application/x-msdownload' })]);
    expect(errors[0].message).toMatch(/Unsupported file type/);
  });

  it('hides the buttons when uploads are off and links are not allowed', () => {
    const el = document.createElement('div');
    new Aurebesh(el, { media: { adapter: null, allowUrl: false } });
    expect(el.querySelector('button[title="Image"]')).toBeNull();
    expect(el.querySelector('button[title="Video"]')).toBeNull();
  });
});
