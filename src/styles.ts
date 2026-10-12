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
.aurebesh-font,.aurebesh-size,.aurebesh-columns,.aurebesh-pagesel{height:28px;max-width:130px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
.aurebesh-toolbar[hidden],.aurebesh-table-pop[hidden]{display:none}
.aurebesh-table-tools{background:var(--aurebesh-table-tools-bg,#eef3ff)}
.aurebesh-table-picker{position:relative;display:inline-block}
.aurebesh-table-pop{position:absolute;top:100%;inset-inline-start:0;z-index:10;margin-top:4px;padding:8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;background:var(--aurebesh-bg,#fff);box-shadow:0 4px 14px rgba(0,0,0,.15)}
.aurebesh-table-grid{display:grid;gap:2px}
.aurebesh-table-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);min-width:0;padding:0;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:0;background:transparent;cursor:pointer}
.aurebesh-table-grid button.on{background:var(--aurebesh-accent,#2563eb);border-color:var(--aurebesh-accent,#2563eb)}
.aurebesh-table-label{margin-top:6px;text-align:center;font-size:12px}
.aurebesh-content table{border-collapse:collapse;margin:.5em 0;width:100%;table-layout:fixed}
.aurebesh-content td,.aurebesh-content th{border:1px solid var(--aurebesh-border,#d0d5dd);padding:6px 8px;vertical-align:top;min-width:30px}
.aurebesh-content th{background:var(--aurebesh-toolbar-bg,#f8f9fb);font-weight:600;text-align:start}
.aurebesh-content.aurebesh-col-resize,.aurebesh-content.aurebesh-col-resize *{cursor:col-resize}
.aurebesh-content.aurebesh-col-resizing{user-select:none}
.aurebesh-swatch-btn{border-bottom:3px solid var(--swatch,transparent)!important;border-radius:4px 4px 0 0!important}
.aurebesh-swatch-color{font-weight:700}
.aurebesh-swatch-highlight{background:#fef08a!important;color:#111!important}
.aurebesh-color-grid{display:grid;grid-template-columns:repeat(10,var(--aurebesh-cell,18px));gap:2px}
.aurebesh-color-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);min-width:0;padding:0;border:1px solid rgba(0,0,0,.2);border-radius:3px;cursor:pointer}
.aurebesh-color-grid button:hover{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
.aurebesh-toolbar button:focus-visible,.aurebesh-toolbar select:focus-visible,.aurebesh-table-pop input:focus-visible,.aurebesh-table-pop button:focus-visible,.aurebesh-alt:focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
@media (pointer:coarse){
.aurebesh-toolbar button{min-width:40px;height:40px}
.aurebesh-font,.aurebesh-size,.aurebesh-columns,.aurebesh-pagesel{height:40px}
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
.aurebesh-count{padding:4px 10px;border-top:1px solid var(--aurebesh-border,#d0d5dd);font-size:12px;color:#667085;text-align:end}
.aurebesh-count[hidden]{display:none}
.aurebesh-count.over{color:#b42318;font-weight:600}
.aurebesh-status.error{color:#b42318;background:#fef3f2}
.aurebesh-content :not(pre)>code{padding:1px 5px;border-radius:4px;background:var(--aurebesh-code-bg,#f3f4f6);font-size:.9em}
.aurebesh-size{max-width:90px}
.aurebesh-link-tools{align-items:center}
.aurebesh-link-url{unicode-bidi:plaintext;flex:1 1 auto;min-width:0;max-width:340px;padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--aurebesh-accent,#2563eb)}
.aurebesh-link-tools button{padding:0 10px}
.aurebesh-pending{display:inline-block;min-width:120px;padding:18px 12px;margin:2px;border:1px dashed var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-toolbar-bg,#f8f9fb);color:#667085;font-size:13px;text-align:center;vertical-align:middle;user-select:none}
.aurebesh-pending::before{content:attr(data-label)}
.aurebesh-image-tools{align-items:center}
.aurebesh-alt{flex:1;min-width:120px;max-width:260px;height:28px;padding:0 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
.aurebesh-sep{width:1px;margin:4px;background:var(--aurebesh-border,#d0d5dd)}
.aurebesh-content{min-height:var(--aurebesh-min-height,150px);padding:10px 12px;outline:0;overflow:auto}
/* A page format: the content becomes a sheet of that width on a desk; with a height, page breaks are marked every page. */
.aurebesh[data-page] .aurebesh-stage{padding:16px;overflow:auto;background:var(--aurebesh-desk,#e4e7ec)}
.aurebesh[data-page] .aurebesh-content{box-sizing:border-box;width:var(--aurebesh-page-w);max-width:100%;min-height:var(--aurebesh-page-h,var(--aurebesh-min-height,150px));margin:0 auto;padding:var(--aurebesh-page-m);overflow:visible;background-color:var(--aurebesh-bg,#fff);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.aurebesh[data-paged] .aurebesh-content{background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--aurebesh-page-h) - 2px),var(--aurebesh-pagebreak,#9aa3b2) calc(var(--aurebesh-page-h) - 2px),var(--aurebesh-pagebreak,#9aa3b2) var(--aurebesh-page-h))}
.aurebesh-content.is-empty::before{content:attr(data-placeholder);color:#9aa1ab;pointer-events:none;position:absolute}
.aurebesh-content blockquote{margin:.5em 0;padding-inline-start:12px;border-inline-start:3px solid #d0d5dd;color:#555}
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
/* ticket mode: a fixed-width layout (one column per printer character) next to a panel */
.aurebesh[data-ticket] .aurebesh-body{display:flex;flex-wrap:wrap;align-items:flex-start}
.aurebesh[data-ticket] .aurebesh-stage{flex:1 1 360px;min-width:0;padding:12px;overflow:auto;background:var(--aurebesh-desk,#e4e7ec)}
.aurebesh[data-ticket] .aurebesh-content.aurebesh-ticket{box-sizing:content-box;width:calc(var(--tk-cols,41)*1ch);margin:0 auto;padding:12px 1ch;overflow:visible;font-family:ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,'DejaVu Sans Mono',monospace;font-size:14px;line-height:1.3;white-space:pre-wrap;word-break:break-all;tab-size:8;background-color:var(--aurebesh-bg,#fff);background-image:repeating-linear-gradient(to right,transparent 0,transparent calc(10ch - 1px),var(--aurebesh-ruler,rgba(120,130,150,.25)) calc(10ch - 1px),var(--aurebesh-ruler,rgba(120,130,150,.25)) 10ch);background-origin:content-box;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.aurebesh[data-ticket] .aurebesh-content.aurebesh-ticket.no-ruler{background-image:none}
.aurebesh-ticket p{margin:0;min-height:1.3em}
.aurebesh-tk{display:inline;white-space:pre;border-radius:3px;background:rgba(37,99,235,.14);box-shadow:inset 0 -1px 0 rgba(37,99,235,.55);cursor:pointer}
.aurebesh-tk-cmd{background:rgba(124,58,237,.14);box-shadow:inset 0 -1px 0 rgba(124,58,237,.55)}
.aurebesh-tk-if{display:inline-block;width:0;height:1.05em;margin:0 -2px;padding:0 2px;box-sizing:content-box;vertical-align:text-bottom;border-radius:1px;background:linear-gradient(rgba(245,158,11,.75),rgba(245,158,11,.75)) center/2px 100% no-repeat;box-shadow:none;cursor:pointer}
.aurebesh-ticket.show-conds .aurebesh-tk-if{width:auto;height:auto;margin:0;padding:0 .5ch;background:rgba(245,158,11,.25);box-shadow:inset 0 -1px 0 rgba(245,158,11,.8);font-size:.7em;line-height:1.4;vertical-align:baseline}
.aurebesh-ticket.show-conds .aurebesh-tk-if::before{content:attr(data-label)}
.aurebesh-tk-if.aurebesh-hot{background:linear-gradient(#f59e0b,#f59e0b) center/4px 100% no-repeat}
::highlight(aurebesh-cond){background-color:rgba(245,158,11,.28)}
.aurebesh-ticket-panel{flex:0 1 400px;min-width:280px;box-sizing:border-box;padding:10px 12px;font-size:13px}
.aurebesh-ticket-switches label{display:block;margin-bottom:4px}
.aurebesh-ticket-heading{margin:10px 0 4px;font-weight:600}
.aurebesh-ticket-note{margin:6px 0;color:#667085}
.aurebesh-ticket-option{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0}
.aurebesh-ticket-option select{max-width:55%;font:inherit;font-size:12px}
.aurebesh-ticket-cond{display:flex;align-items:center;gap:4px;margin:3px 0;padding:2px 4px;border-radius:4px}
.aurebesh-ticket-cond:hover{background:rgba(245,158,11,.15)}
.aurebesh-ticket-cond span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aurebesh-ticket-cond button,.aurebesh-ticket-load,.aurebesh-ticket-form button,.aurebesh-ticket-pop button{font:inherit;font-size:12px;padding:2px 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:transparent;color:inherit;cursor:pointer}
.aurebesh-ticket-form{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 auto}
.aurebesh-ticket-form input,.aurebesh-ticket-form select{font:inherit;font-size:12px;min-width:0;max-width:100%}
.aurebesh-ticket-warn{margin:6px 0;color:#b42318}
.aurebesh-ticket-tabs{display:flex;gap:4px;margin:10px 0 0;border-bottom:1px solid var(--aurebesh-border,#d0d5dd)}
.aurebesh-ticket-tabs button{padding:4px 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;font:inherit;cursor:pointer}
.aurebesh-ticket-tabs button[aria-selected="true"]{border-bottom-color:var(--aurebesh-accent,#2563eb);font-weight:600}
.aurebesh-ticket-pane{padding-top:8px}
.aurebesh-ticket-pane[hidden]{display:none}
.aurebesh-ticket-paper{display:flex;flex-direction:column;align-items:flex-start;gap:14px;max-width:100%;padding:4px 0 8px;font-family:ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,'DejaVu Sans Mono',monospace;font-size:13px;line-height:1.3;white-space:pre;overflow-x:auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
.aurebesh-ticket-slip{box-sizing:content-box;flex:none;width:calc(var(--tk-cols,41)*1ch);padding:26px 1ch;background:#fff;color:#111}
.aurebesh-ticket-pl.over{outline:1px solid #b42318}
.aurebesh-ticket-slip .aurebesh-tk{background:transparent;box-shadow:none;cursor:default;color:#667085}
.aurebesh-ticket-code{box-sizing:border-box;width:100%;min-height:260px;padding:6px;font:12px/1.4 ui-monospace,'Cascadia Code',Menlo,Consolas,monospace;white-space:pre;overflow:auto;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit}
.aurebesh-ticket-load{margin-top:6px}
.aurebesh-ticket-load:disabled{opacity:.5;cursor:default}
.aurebesh-ticket-list{display:flex;flex-direction:column;gap:2px;max-height:260px;margin-top:6px;overflow:auto}
.aurebesh-ticket-item{display:flex;justify-content:space-between;gap:16px;text-align:start}
.aurebesh-ticket-item small{opacity:.6}
.aurebesh-ticket-pop{min-width:260px}
.aurebesh-ticket-chip-tools{align-items:center}
.aurebesh-ticket-logo{display:inline-block;max-width:100%;height:auto;vertical-align:top;filter:grayscale(1) contrast(1.4)}
.aurebesh-ticket-data input[type="text"]{box-sizing:border-box;min-width:0;width:100%;font:inherit;font-size:12px;padding:2px 4px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:3px;background:var(--aurebesh-bg,#fff);color:inherit}
.aurebesh-ticket-data .aurebesh-ticket-option input[type="text"]{width:55%}
.aurebesh-ticket-data table{width:100%;margin:4px 0;border-collapse:collapse;table-layout:auto}
.aurebesh-ticket-data th{padding:2px 4px;font-size:11px;font-weight:600;text-align:start;white-space:nowrap}
.aurebesh-ticket-data td{padding:1px 2px}
.aurebesh-ticket-data button{font:inherit;font-size:12px;padding:2px 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:transparent;color:inherit;cursor:pointer}
/* Every block finds its own direction from its first strong letter (Arabic, Hebrew); a dir attribute overrides it. */
.aurebesh-content:not([dir]),.aurebesh-content :is(p,h1,h2,h3,blockquote,li,td,th):not([dir]){unicode-bidi:plaintext}
.aurebesh-content pre{direction:ltr;text-align:left}
.aurebesh-content pre[dir=rtl]{direction:rtl;text-align:right}
.aurebesh-content :is(ul,ol)[dir=rtl]{padding-inline-start:40px}
`;
