export const CSS = `
.aurebesh{border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;background:var(--aurebesh-bg,#fff);color:var(--aurebesh-color,#111);font-family:inherit}
.aurebesh-toolbar{display:flex;flex-wrap:wrap;gap:2px;padding:4px;border-bottom:1px solid var(--aurebesh-border,#d0d5dd);background:var(--aurebesh-toolbar-bg,#f8f9fb)}
.aurebesh-toolbar button{min-width:28px;height:28px;padding:0 6px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px}
.aurebesh-toolbar button:hover{background:rgba(0,0,0,.08)}
.aurebesh-toolbar button[aria-pressed="true"]{background:var(--aurebesh-accent,#2563eb);color:#fff}
.aurebesh-toolbar button:disabled{opacity:.4;cursor:default}
.aurebesh-content aside{box-sizing:border-box;margin:.25em 0 .5em;padding:.6em .9em;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;background:var(--aurebesh-toolbar-bg,#f8f9fb);font-size:.95em}
.aurebesh-content aside[style*="float: right"]{margin-left:1em}
.aurebesh-content aside[style*="float: left"]{margin-right:1em}
.aurebesh-content aside>:first-child{margin-top:0}
.aurebesh-content aside>:last-child{margin-bottom:0}
.aurebesh-content div[style*="column-count"]{margin:.5em 0;padding:4px 0;outline:1px dashed var(--aurebesh-border,#d0d5dd);outline-offset:4px}
.aurebesh-content div[style*="column-count"] :is(table,pre,blockquote,aside,img,video,iframe){break-inside:avoid}
.aurebesh-font,.aurebesh-size,.aurebesh-columns{height:28px;max-width:130px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
.aurebesh-toolbar[hidden],.aurebesh-table-pop[hidden]{display:none}
.aurebesh-table-tools{background:var(--aurebesh-table-tools-bg,#eef3ff)}
.aurebesh-table-picker{position:relative;display:inline-block}
.aurebesh-table-pop{position:absolute;top:100%;left:0;z-index:10;margin-top:4px;padding:8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;background:var(--aurebesh-bg,#fff);box-shadow:0 4px 14px rgba(0,0,0,.15)}
.aurebesh-table-grid{display:grid;gap:2px}
.aurebesh-table-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);min-width:0;padding:0;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:0;background:transparent;cursor:pointer}
.aurebesh-table-grid button.on{background:var(--aurebesh-accent,#2563eb);border-color:var(--aurebesh-accent,#2563eb)}
.aurebesh-table-label{margin-top:6px;text-align:center;font-size:12px}
.aurebesh-content table{border-collapse:collapse;margin:.5em 0;width:100%;table-layout:fixed}
.aurebesh-content td,.aurebesh-content th{border:1px solid var(--aurebesh-border,#d0d5dd);padding:6px 8px;vertical-align:top;min-width:30px}
.aurebesh-content th{background:var(--aurebesh-toolbar-bg,#f8f9fb);font-weight:600;text-align:left}
.aurebesh-swatch-btn{border-bottom:3px solid var(--swatch,transparent)!important;border-radius:4px 4px 0 0!important}
.aurebesh-swatch-color{font-weight:700}
.aurebesh-swatch-highlight{background:#fef08a!important;color:#111!important}
.aurebesh-color-grid{display:grid;grid-template-columns:repeat(10,var(--aurebesh-cell,18px));gap:2px}
.aurebesh-color-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);min-width:0;padding:0;border:1px solid rgba(0,0,0,.2);border-radius:3px;cursor:pointer}
.aurebesh-color-grid button:hover{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
.aurebesh-toolbar button:focus-visible,.aurebesh-toolbar select:focus-visible,.aurebesh-table-pop input:focus-visible,.aurebesh-table-pop button:focus-visible,.aurebesh-alt:focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
@media (pointer:coarse){
.aurebesh-toolbar button{min-width:40px;height:40px}
.aurebesh-font,.aurebesh-size,.aurebesh-columns{height:40px}
.aurebesh-table-pop{--aurebesh-cell:28px}
}
.aurebesh-color-reset{display:block;width:100%;margin-top:6px;padding:4px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px}
.aurebesh-color-custom{display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:12px}
.aurebesh-color-custom input{width:40px;height:24px;padding:0;border:0;background:none;cursor:pointer}
.aurebesh-content img,.aurebesh-content video{max-width:100%;height:auto;border-radius:4px}
.aurebesh-content video{display:block;margin:.5em 0}
.aurebesh-content iframe{display:block;width:100%;aspect-ratio:16/9;margin:.5em 0;border:0;border-radius:4px;pointer-events:none}
.aurebesh-media-form{display:flex;flex-direction:column;gap:6px;min-width:260px}
.aurebesh-media-form input[type="url"],.aurebesh-media-form input[type="text"]{padding:5px 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
.aurebesh-media-form button{padding:5px 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px}
.aurebesh-status{padding:5px 10px;border-top:1px solid var(--aurebesh-border,#d0d5dd);background:var(--aurebesh-toolbar-bg,#f8f9fb);font-size:12px}
.aurebesh-status[hidden]{display:none}
.aurebesh-status.error{color:#b42318;background:#fef3f2}
.aurebesh-content :not(pre)>code{padding:1px 5px;border-radius:4px;background:var(--aurebesh-code-bg,#f3f4f6);font-size:.9em}
.aurebesh-size{max-width:90px}
.aurebesh-pending{display:inline-block;min-width:120px;padding:18px 12px;margin:2px;border:1px dashed var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-toolbar-bg,#f8f9fb);color:#667085;font-size:13px;text-align:center;vertical-align:middle;user-select:none}
.aurebesh-pending::before{content:attr(data-label)}
.aurebesh-image-tools{align-items:center}
.aurebesh-alt{flex:1;min-width:120px;max-width:260px;height:28px;padding:0 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
.aurebesh-sep{width:1px;margin:4px;background:var(--aurebesh-border,#d0d5dd)}
.aurebesh-content{min-height:var(--aurebesh-min-height,150px);padding:10px 12px;outline:0;overflow:auto}
.aurebesh-content.is-empty::before{content:attr(data-placeholder);color:#9aa1ab;pointer-events:none;position:absolute}
.aurebesh-content blockquote{margin:.5em 0;padding-left:12px;border-left:3px solid #d0d5dd;color:#555}
.aurebesh-content pre{margin:.5em 0;padding:10px 12px;border-radius:6px;background:var(--aurebesh-code-bg,#f3f4f6);overflow-x:auto;tab-size:2;font-family:ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,'DejaVu Sans Mono',monospace;font-size:.9em}
.aurebesh-content code{font-family:ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,'DejaVu Sans Mono',monospace}
::highlight(aurebesh-comment){color:var(--aurebesh-hl-comment,#6e7781)}
::highlight(aurebesh-string){color:var(--aurebesh-hl-string,#0a3069)}
::highlight(aurebesh-number){color:var(--aurebesh-hl-number,#0550ae)}
::highlight(aurebesh-keyword){color:var(--aurebesh-hl-keyword,#cf222e)}
::highlight(aurebesh-function){color:var(--aurebesh-hl-function,#8250df)}
::highlight(aurebesh-type){color:var(--aurebesh-hl-type,#953800)}
::highlight(aurebesh-tag){color:var(--aurebesh-hl-tag,#116329)}
.aurebesh-content a{color:var(--aurebesh-accent,#2563eb)}
`;
