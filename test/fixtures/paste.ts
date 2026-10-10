/**
 * Clipboard samples shaped like what Google Docs and Microsoft Word put on the clipboard (text/html, and Word's text/rtf).
 * They are reconstructed from the structure those programs are known to produce, not copied from a real session,
 * so real documents should still be tried by hand.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8Dwn4EIwDiqkL4KAcT9GO0U4BxoAAAAAElFTkSuQmCC';

const SPAN = 'font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-variant:normal;white-space:pre-wrap;vertical-align:baseline;';

/** Google Docs: formatting as inline styles, a font-weight:normal <b> wrapper, real lists, linked images. */
export const GOOGLE_DOCS_HTML = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;text-decoration:none;">Report</span></h1><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="${SPAN}font-weight:400;">Plain </span><span style="${SPAN}font-weight:700;">bold</span><span style="${SPAN}font-weight:400;"> </span><span style="${SPAN}font-style:italic;font-weight:400;">italic</span><span style="${SPAN}font-weight:400;"> </span><span style="${SPAN}font-weight:400;text-decoration:underline;">under</span><span style="${SPAN}font-weight:400;"> </span><span style="${SPAN}font-weight:400;color:#ff0000;">red</span><span style="${SPAN}font-weight:400;"> and a </span><a href="https://www.google.com/url?q=https://example.com/page&amp;sa=D&amp;source=editors&amp;ust=1700000000&amp;usg=AOvVaw0abc" style="text-decoration:none;"><span style="${SPAN}color:#1155cc;font-weight:400;text-decoration:underline;">link</span></a></p><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;" aria-level="1"><p dir="ltr" role="presentation"><span style="${SPAN}font-weight:400;">first</span></p></li><ul style="margin-top:0;margin-bottom:0;"><li dir="ltr" style="list-style-type:circle;" aria-level="2"><p dir="ltr" role="presentation"><span style="${SPAN}font-weight:400;">nested</span></p></li></ul><li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" role="presentation"><span style="${SPAN}font-weight:400;">second</span></p></li></ul><p dir="ltr" style="text-align:center;"><span style="${SPAN}"><img src="https://lh7-rt.googleusercontent.com/docsz/AD_4nXa1?key=abc123" width="100" height="50" style="border:none;"></span></p><p dir="ltr"><span style="${SPAN}"><img src="https://lh7-rt.googleusercontent.com/docsz/AD_4nXb2?key=def456" width="100" height="50"></span></p></b>`;

/** Word: classes and mso-* styles, list paragraphs with a bullet span, conditional comments, pictures as file: links. */
export const WORD_HTML = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=Generator content="Microsoft Word 15"><style><!-- p.MsoNormal {margin:0cm;font-size:11.0pt;font-family:"Calibri",sans-serif;} --></style></head><body lang=NL style='tab-interval:35.4pt;word-wrap:break-word'><!--StartFragment--><p class=MsoNormal><b>Vet</b> en <i>cursief</i> met <span style='color:red'>rood</span> en <span style='background:yellow;mso-highlight:yellow'>markering</span><o:p></o:p></p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Eerste<o:p></o:p></p><p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Genest<o:p></o:p></p><p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Tweede<o:p></o:p></p><p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Nummer een<o:p></o:p></p><p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Nummer twee<o:p></o:p></p><p class=MsoNormal><!--[if gte vml 1]><v:shape id="Afbeelding_x0020_1" type="#_x0000_t75" style='width:75pt;height:37.5pt'><v:imagedata src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" o:title=""/></v:shape><![endif]--><![if !vml]><img width=100 height=50 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" v:shapes="Afbeelding_x0020_1"><![endif]><o:p></o:p></p><p class=MsoNormal><![if !vml]><img width=100 height=50 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png" v:shapes="Afbeelding_x0020_2"><![endif]><o:p></o:p></p><!--EndFragment--></body></html>`;

/**
 * Word with a two-column section: the column setting lives in the style sheet (`@page WordSection1 { mso-columns }`),
 * and the section is a `<div class=WordSection1>`. Section 2 has one column.
 */
export const WORD_COLUMNS_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><style><!--
 /* Style Definitions */
 p.MsoNormal, li.MsoNormal, div.MsoNormal {margin:0cm;font-size:11.0pt;font-family:"Calibri",sans-serif;}
 /* Page Definitions */
 @page WordSection1
	{size:595.3pt 841.9pt;
	margin:70.85pt 70.85pt 70.85pt 70.85pt;
	mso-header-margin:35.4pt;
	mso-footer-margin:35.4pt;
	mso-columns:2 even 35.4pt;
	mso-paper-source:0;}
 div.WordSection1
	{page:WordSection1;}
 @page WordSection2
	{size:595.3pt 841.9pt;
	margin:70.85pt 70.85pt 70.85pt 70.85pt;
	mso-columns:1 even 35.4pt;}
 div.WordSection2
	{page:WordSection2;}
--></style></head><body lang=NL><!--StartFragment--><div class=WordSection1><p class=MsoNormal><b>Krant</b> kolom een met wat tekst die doorloopt.<o:p></o:p></p><p class=MsoNormal>Tweede alinea van de krant.<o:p></o:p></p></div><span style='font-size:11.0pt;font-family:"Calibri",sans-serif'><br clear=all style='page-break-before:auto;mso-break-type:section-break'></span><div class=WordSection2><p class=MsoNormal>Daarna gewone tekst.<o:p></o:p></p></div><!--EndFragment--></body></html>`;

/**
 * A real Word clipboard (the "Newsletter" template: sidebar, pull quote, banners, columns, a floating picture), reduced to
 * its structure: drawing data, settings blocks and links to the author's folders removed. Word 365 writes shapes as VML
 * (`<v:rect>` + `<v:textbox>`) with their position in percent of the page, and pictures as `<v:imagedata>` without any `<img>`.
 */
const NEWSLETTER_FILE = join(process.cwd(), 'test', 'fixtures', 'word-newsletter.html');
/** The sample is not committed (it comes from a real document): null when the file is not there, and its tests are skipped. */
export const NEWSLETTER_HTML: string | null = existsSync(NEWSLETTER_FILE) ? readFileSync(NEWSLETTER_FILE, 'utf8') : null;

export const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);

/**
 * The RTF side of that clipboard, with the structure the real one has: a decoy picture that is only the fill of another
 * shape (`fillBlip`), the real picture of shape 2052 (`pib`, matching `o:spid="_x0000_s2052"` in the HTML) and the
 * metafile fallback of that same shape (`\shprslt`).
 */
export function newsletterRtf(bytes = JPEG_BYTES): string {
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const decoy = Uint8Array.from([0x11, 0x22, 0x33, 0x44]);
  return (
    `{\\rtf1\\ansi\\ansicpg0\\deff0{\\fonttbl{\\f0 Times New Roman;}}\r\n` +
    `{\\shp{\\*\\shpinst\\shpleft0\\shptop0\\shplid1027{\\sp{\\sn shapeType}{\\sv 1}}{\\sp{\\sn fillType}{\\sv 2}} {\\sp{\\sn fillBlip}{\\sv {\\pict\\picscalex-1\\picscaley-1\\picw4336\\pich4336\\picwgoal2458\\pichgoal2458\\jpegblip\\bliptag959182430{\\*\\blipuid 392bf65e3bc911f0}${hex(decoy)}}}}}}\r\n` +
    `{\\shp{\\*\\shpinst\\shpleft0\\shptop0\\shplid2052{\\sp{\\sn shapeType}{\\sv 75}}{\\sp{\\sn fLockAspectRatio}{\\sv 1}} {\\sp{\\sn pib}{\\sv {\\pict\\picscalex100\\picscaley100\\picw10576\\pich6604\\picwgoal5996\\pichgoal3744\\jpegblip\\bliptag-972208702{\\*\\blipuid c60d45c2ae1f6f40}${hex(bytes).replace(/(.{40})/g, '$1\r\n')}}}}}}` +
    `{\\shprslt\\par\\pard{\\pict\\picscalex100\\picscaley100\\picw10576\\pich6604\\wmetafile8\\bliptag-972208702\\blipupi220{\\*\\blipuid c60d45c2ae1f6f40}0100090000037e0000}}}\r\n}`
  );
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const pngBytes = () => Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));

/**
 * Word's RTF for pictures: each picture is `{\*\shppict{\pict...hex}}` followed by a `{\nonshppict{\pict\wmetafile8 ...}}`
 * fallback. `kinds` gives the picture format per picture; 'emf' pictures can't be used in a browser.
 */
export function wordRtf(kinds: Array<'png' | 'jpeg' | 'emf'>, bytes = pngBytes()): string {
  const pictures = kinds
    .map((kind, i) => {
      const blip = kind === 'png' ? '\\pngblip' : kind === 'jpeg' ? '\\jpegblip' : '\\emfblip';
      // the hex data directly follows the closing brace of {\*\blipuid ...}, as Word writes it
      return (
        `{\\*\\shppict{\\pict{\\*\\picprop{\\sp{\\sn shapeType}{\\sv 75}}{\\sp{\\sn fLockAspectRatio}{\\sv 1}}}\\picscalex100\\picscaley100\\piccropl0\\picw1000\\pich500\\picwgoal1500\\pichgoal750${blip}\\bliptag${123456 + i}{\\*\\blipuid 00${i}bbbbbbbbbbbbbbbbbbbbbbbbbbbb}${toHex(bytes).replace(/(.{64})/g, '$1\r\n')}}}` +
        `{\\nonshppict{\\pict{\\*\\picprop}\\picscalex100\\picw1000\\pich500\\wmetafile8 0100090000037e00000000005e0000000000}}`
      );
    })
    .join('\\par\r\n');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil Calibri;}}\\viewkind4\\uc1\\pard\\f0\\fs22 Text\\par\r\n${pictures}\\par}`;
}
