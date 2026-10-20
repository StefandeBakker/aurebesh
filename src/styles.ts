import { DEFAULT_CALLOUTS, calloutCss } from './callouts';
import { taskListCss } from './tasks';

export const CSS = `
.aurebesh{border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;background:var(--aurebesh-bg,#fff);color:var(--aurebesh-color,#111);font-family:inherit}
.aurebesh-toolbar{display:flex;flex-wrap:wrap;gap:4px 6px;padding:4px;border-bottom:1px solid var(--aurebesh-border,#d0d5dd);background:var(--aurebesh-toolbar-bg,#f8f9fb)}
/* the toolbar is blocks of one or two rows; a block moves as a whole when the toolbar is narrow */
.aurebesh-group{display:flex;flex:0 1 auto;min-width:0;max-width:100%;flex-direction:column;gap:2px;align-items:flex-start;padding-inline-end:6px;border-inline-end:1px solid var(--aurebesh-border,#d0d5dd)}
.aurebesh-group:last-child{padding-inline-end:0;border-inline-end:0}
.aurebesh-row{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
/* the strip above the toolbar: small, and apart from the formatting */
.aurebesh-quickbar{flex-wrap:nowrap;gap:0;padding:2px 4px;border-bottom:0}
.aurebesh-quickbar button{min-width:26px;height:26px}
.aurebesh-quickbar .aurebesh-icon{width:16px;height:16px}
.aurebesh-quickbar+.aurebesh-toolbar{border-top:1px solid var(--aurebesh-border,#d0d5dd)}
/* icons: line drawings in the colour of the text, so they follow the theme and the pressed state */
.aurebesh-icon{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.aurebesh-toolbar button:has(>.aurebesh-icon){display:inline-flex;align-items:center;justify-content:center;padding:0 5px}
.aurebesh-toolbar button{min-width:28px;height:28px;padding:0 6px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px}
.aurebesh-toolbar button:hover{background:var(--aurebesh-hover,rgba(0,0,0,.08))}
.aurebesh-toolbar button[aria-pressed="true"]{background:var(--aurebesh-accent,#2563eb);color:#fff}
.aurebesh-toolbar button:disabled{opacity:.4;cursor:default}
.aurebesh-cmd-bold{font-weight:700}
.aurebesh-cmd-italic{font-style:italic}
.aurebesh-cmd-underline{text-decoration:underline}
.aurebesh-cmd-strike{text-decoration:line-through}
/* a toolbar whose blocks have a name (#Name in the toolbar option): the larger look of a ribbon, with the name above the buttons */
.aurebesh-ribbon .aurebesh-toolbar:not(.aurebesh-quickbar){align-items:flex-start;gap:12px 0;padding:14px 16px}
.aurebesh-ribbon .aurebesh-group{gap:8px;padding-inline:13px}
.aurebesh-ribbon .aurebesh-group:first-child{padding-inline-start:0}
.aurebesh-ribbon .aurebesh-group:has(+.aurebesh-group-end){border-inline-end:0}
.aurebesh-group-end{margin-inline-start:auto}
.aurebesh-group-label{font-size:12px;font-weight:500;line-height:1;color:var(--aurebesh-label,#667085);white-space:nowrap}
.aurebesh-ribbon .aurebesh-row{gap:4px}
.aurebesh-ribbon .aurebesh-group button{min-width:40px;height:40px;border-radius:8px;color:var(--aurebesh-icon,inherit)}
.aurebesh-ribbon .aurebesh-group .aurebesh-icon{width:20px;height:20px;stroke-width:1.6}
.aurebesh-ribbon .aurebesh-group button[aria-pressed="true"]{background:var(--aurebesh-active-bg,#e0e9ff);color:var(--aurebesh-active-color,#1d4ed8)}
.aurebesh-ribbon .aurebesh-group button[aria-pressed="true"]:hover{background:var(--aurebesh-active-bg,#e0e9ff)}
.aurebesh-ribbon .aurebesh-group button:not(:has(>.aurebesh-icon)){font-size:14px;font-weight:600}
.aurebesh-ribbon .aurebesh-group button.aurebesh-cmd-italic{font-weight:500}
/* the buttons inside a dropdown (swatches, the table size, the lists) are not ribbon buttons: they keep their own size */
.aurebesh-ribbon .aurebesh-group .aurebesh-table-pop button{min-width:0;height:auto;border-radius:4px;font-size:13px;font-weight:400}
.aurebesh-ribbon .aurebesh-group .aurebesh-color-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);border-radius:3px}
.aurebesh-ribbon .aurebesh-group .aurebesh-table-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);border-radius:0}
.aurebesh-ribbon .aurebesh-group button.aurebesh-cmd-underline{text-underline-offset:3px}
/* the layout panel beside the text */
/* the text and the sidebar side by side: with a maximum height the body keeps to it, and a sidebar that is taller scrolls inside it */
.aurebesh-body{display:flex;align-items:stretch;max-height:var(--aurebesh-max-height,none)}
.aurebesh-body>.aurebesh-stage{flex:1 1 auto;min-width:0;min-height:0}
.aurebesh:not([data-page]) .aurebesh-body>.aurebesh-stage{display:flex;flex-direction:column}
.aurebesh:not([data-page]) .aurebesh-body>.aurebesh-stage>.aurebesh-content{flex:1 1 auto}
.aurebesh-panel{box-sizing:border-box;flex:none;min-height:0;width:var(--aurebesh-panel-width,280px);max-width:45%;padding:16px;overflow:auto;border-inline-start:1px solid var(--aurebesh-border,#d0d5dd);background:var(--aurebesh-toolbar-bg,#f8f9fb);font-size:13px}
.aurebesh-panel[hidden]{display:none}
.aurebesh-panel-pane[hidden]{display:none}
.aurebesh-panel-tabs{display:flex;gap:2px;min-width:0;overflow-x:auto}
.aurebesh-panel-tab{flex:none;padding:4px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--aurebesh-label,#667085);cursor:pointer;font:inherit;font-size:14px}
.aurebesh-panel-tab[aria-selected="true"]{border-bottom-color:var(--aurebesh-accent,#2563eb);color:inherit;font-weight:600}
.aurebesh-panel :is(.aurebesh-panel-tab):focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
.aurebesh-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:15px}
.aurebesh-panel-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--aurebesh-icon,inherit);cursor:pointer}
.aurebesh-panel-close:hover{background:var(--aurebesh-hover,rgba(0,0,0,.08))}
.aurebesh-panel-close .aurebesh-icon{width:16px;height:16px}
.aurebesh-panel-section{display:flex;flex-direction:column;gap:12px;padding-bottom:16px}
.aurebesh-panel-section+.aurebesh-panel-section{padding-top:16px;border-top:1px solid var(--aurebesh-border,#d0d5dd)}
.aurebesh-field{display:flex;flex-direction:column;gap:6px}
.aurebesh-field-label{color:var(--aurebesh-label,#667085)}
.aurebesh-field-box{display:flex;align-items:center;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:8px;background:var(--aurebesh-field-bg,var(--aurebesh-bg,#fff))}
.aurebesh-field-box:focus-within{border-color:var(--aurebesh-accent,#2563eb)}
.aurebesh-field-box input{flex:1 1 auto;min-width:0;height:38px;padding:0 10px;border:0;background:transparent;color:inherit;font:inherit;outline:0}
.aurebesh-field-unit{padding-inline-end:10px;color:var(--aurebesh-label,#667085);font-size:12px}
.aurebesh-panel select{width:100%;max-width:none;height:38px;padding:0 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:8px;background:var(--aurebesh-field-bg,var(--aurebesh-bg,#fff));color:inherit;font:inherit}
.aurebesh-panel :is(input,select,button):focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
.aurebesh-hint{color:var(--aurebesh-label,#667085);font-size:12px;line-height:1.4}
.aurebesh-fullscreen .aurebesh-body{flex:1 1 auto;min-height:0;max-height:none}
/* the tooltip of a button: its name and its shortcut */
.aurebesh-tip{position:absolute;z-index:30;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:6px;background:var(--aurebesh-tip-bg,#1f2937);color:var(--aurebesh-tip-color,#f3f4f6);font-size:12px;line-height:16px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.aurebesh-tip[hidden]{display:none}
.aurebesh-tip kbd{font:inherit;opacity:.7}
/* full screen: the editor fills the window, and the text scrolls inside it */
.aurebesh-fullscreen{position:fixed!important;inset:0;z-index:2147483000;display:flex;flex-direction:column;border-radius:0;max-height:none}
.aurebesh-fullscreen .aurebesh-stage{flex:1 1 auto;min-height:0;max-height:none!important;overflow:auto}
.aurebesh-fullscreen:not([data-page]) .aurebesh-content{max-height:none;min-height:100%;box-sizing:border-box}
.aurebesh-content aside{box-sizing:border-box;margin:.25em 0 .5em;padding:.6em .9em;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;background:var(--aurebesh-toolbar-bg,#f8f9fb);font-size:.95em}
.aurebesh-content aside[style*="float: right"]{margin-left:1em}
.aurebesh-content aside[style*="float: left"]{margin-right:1em}
.aurebesh-content aside>:first-child{margin-top:0}
.aurebesh-content aside>:last-child{margin-bottom:0}
.aurebesh-content div[style*="column-count"]{margin:.5em 0;padding:4px 0;outline:1px dashed var(--aurebesh-border,#d0d5dd);outline-offset:4px}
.aurebesh-content div[style*="column-count"] :is(table,pre,blockquote,aside,img,video,iframe){break-inside:avoid}
.aurebesh-font,.aurebesh-size,.aurebesh-weight,.aurebesh-codelang,.aurebesh-columns,.aurebesh-pagesel,.aurebesh-cellborder{height:28px;max-width:130px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
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
.aurebesh-cmd-sidebar[aria-expanded="true"]{background:var(--aurebesh-active-bg,#e0e9ff)!important;color:var(--aurebesh-active-color,#1d4ed8)!important}
/* the look of a strikethrough */
.aurebesh-strike-pop{display:flex;flex-direction:column;gap:2px;width:max-content;max-width:calc(100vw - 16px)}
.aurebesh-strike-option:disabled{opacity:.4;cursor:default;background:transparent}
.aurebesh-strike-option{padding:6px 10px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px;text-align:start}
.aurebesh-strike-option:hover,.aurebesh-strike-option[aria-pressed="true"]{background:var(--aurebesh-hover,rgba(0,0,0,.06))}
.aurebesh-strike-pop .aurebesh-color-grid{margin-top:6px}
/* callouts in the text: the picker, and the slash menu */
.aurebesh-callout-option{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px;text-align:start}
.aurebesh-callout-option:hover,.aurebesh-callout-option[aria-pressed="true"]{background:var(--aurebesh-hover,rgba(0,0,0,.06))}
.aurebesh-callout-dot{flex:none;width:12px;height:12px;border-radius:3px;background:var(--c,#999)}
.aurebesh-callout-list{display:flex;flex-direction:column;min-width:170px}
.aurebesh-slash{position:fixed;z-index:2147483000;min-width:200px;max-height:260px;overflow:auto;padding:4px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:8px;background:var(--aurebesh-bg,#fff);color:var(--aurebesh-color,#111);box-shadow:0 8px 24px rgba(0,0,0,.18);font:13px system-ui,sans-serif}
.aurebesh-slash[hidden]{display:none}
.aurebesh-slash-item{padding:6px 10px;border-radius:5px;cursor:pointer}
.aurebesh-slash-item[aria-selected="true"]{background:var(--aurebesh-active-bg,#e0e9ff);color:var(--aurebesh-active-color,#1d4ed8)}
/* the building blocks: the panel, the rows and columns in the text, and the line that shows where a block goes */
.aurebesh-panel-blocks{display:flex;flex-direction:column;gap:12px}
.aurebesh-blocks-title{margin:4px 0 0;color:var(--aurebesh-label,#667085);font-size:12px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.aurebesh-blocks{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.aurebesh-block{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:64px;padding:8px 6px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:8px;background:var(--aurebesh-field-bg,var(--aurebesh-bg,#fff));color:var(--aurebesh-label,#667085);cursor:grab;font:inherit;font-size:12px;text-align:center}
.aurebesh-block:hover{background:var(--aurebesh-hover,rgba(0,0,0,.06))}
.aurebesh-block:focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
.aurebesh-block .aurebesh-icon{width:22px;height:22px}
.aurebesh-block-bars{display:flex;gap:3px;width:100%;height:20px}
.aurebesh-block-bars span{border-radius:3px;background:currentColor;opacity:.55}
.aurebesh-blockdrop{position:fixed;z-index:2147483000;height:3px;margin-top:-1px;border-radius:2px;background:var(--aurebesh-accent,#2563eb);pointer-events:none}
.aurebesh-content [data-layout="row"]{margin:.5em 0}
.aurebesh-content [data-layout="col"]{min-height:2.5em;padding:6px 8px;outline:1px dashed var(--aurebesh-border,#d0d5dd);outline-offset:-1px}
.aurebesh-content [data-layout="col"]:focus-within{outline-color:var(--aurebesh-accent,#2563eb)}
.aurebesh-row-tools{align-items:center}
/* the handles on the table with the caret: borders to drag, grips to move a row or a column, and the frames of the selected cells */
.aurebesh-stage{position:relative}
.aurebesh-handles{position:absolute;z-index:4;overflow:hidden;pointer-events:none}
.aurebesh-handle{position:absolute;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none}
.aurebesh-handle-col{width:12px;margin-inline-start:-6px;cursor:col-resize}
.aurebesh-handle-row{height:12px;margin-top:-6px;cursor:row-resize}
.aurebesh-handle-col::after,.aurebesh-handle-row::after{content:'';position:absolute;background:var(--aurebesh-accent,#2563eb);opacity:0;transition:opacity .1s}
.aurebesh-handle-col::after{inset-block:0;left:5px;width:2px}
.aurebesh-handle-row::after{inset-inline:0;top:5px;height:2px}
.aurebesh-handle-col:hover::after,.aurebesh-handle-row:hover::after,.aurebesh-handle.is-dragging::after{opacity:.9}
.aurebesh-handle-col-grip,.aurebesh-handle-row-grip{display:flex;align-items:center;justify-content:center;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-toolbar-bg,#f8f9fb);color:var(--aurebesh-label,#667085);cursor:grab;opacity:.75}
.aurebesh-handle-col-grip{width:22px;height:12px;margin-left:-11px}
.aurebesh-handle-row-grip{width:12px;height:22px;margin-top:-11px}
.aurebesh-handle-col-grip::before,.aurebesh-handle-row-grip::before{content:'';width:10px;height:6px;background-image:radial-gradient(currentColor 1px,transparent 1.4px);background-size:4px 4px}
.aurebesh-handle-row-grip::before{width:6px;height:10px}
.aurebesh-handle-col-grip:hover,.aurebesh-handle-row-grip:hover,.aurebesh-handle.is-dragging{opacity:1;background:var(--aurebesh-hover,#eef0f4)}
.aurebesh-handle.is-dragging{cursor:grabbing}
.aurebesh-drop{position:absolute;pointer-events:none;background:var(--aurebesh-accent,#2563eb);border-radius:2px}
.aurebesh-cell-sel{position:absolute;box-sizing:border-box;pointer-events:none;border:2px solid var(--aurebesh-accent,#2563eb);background:color-mix(in srgb,var(--aurebesh-accent,#2563eb) 14%,transparent)}
@media (pointer:coarse){.aurebesh-handle-col{width:32px;margin-inline-start:-16px}.aurebesh-handle-col::after{left:15px}.aurebesh-handle-row{height:32px;margin-top:-16px}.aurebesh-handle-row::after{top:15px}.aurebesh-handle-col-grip{width:34px;height:20px;margin-left:-17px}.aurebesh-handle-row-grip{width:20px;height:34px;margin-top:-17px}.aurebesh-handle-col::after,.aurebesh-handle-row::after{opacity:.35}}
.aurebesh-content.aurebesh-col-resizing{user-select:none}
/* the colour buttons: an icon with a bar in the colour chosen last, and a small arrow for the palette that opens */
.aurebesh-icon-swatch{stroke:rgba(0,0,0,.35);stroke-width:.6}
.aurebesh-swatch-color .aurebesh-icon-swatch,.aurebesh-swatch-cellBorderColor .aurebesh-icon-swatch{fill:var(--swatch,currentColor)}
.aurebesh-swatch-cellBackground .aurebesh-icon-swatch{fill:var(--swatch,transparent)}
.aurebesh-swatch-highlight .aurebesh-icon-swatch{fill:var(--swatch,#facc15)}
.aurebesh-swatch-btn::after{content:'';flex:none;margin-inline-start:3px;border:3px solid transparent;border-top-color:currentColor;border-bottom-width:0;opacity:.7}
.aurebesh-color-grid{display:grid;grid-template-columns:repeat(10,var(--aurebesh-cell,18px));gap:2px}
.aurebesh-color-grid button{width:var(--aurebesh-cell,18px);height:var(--aurebesh-cell,18px);min-width:0;padding:0;border:1px solid rgba(0,0,0,.2);border-radius:3px;cursor:pointer}
.aurebesh-color-grid button:hover{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
.aurebesh-toolbar button:focus-visible,.aurebesh-toolbar select:focus-visible,.aurebesh-table-pop input:focus-visible,.aurebesh-table-pop button:focus-visible,.aurebesh-alt:focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
@media (pointer:coarse){
.aurebesh-toolbar button{min-width:40px;height:40px}
.aurebesh-font,.aurebesh-size,.aurebesh-weight,.aurebesh-codelang,.aurebesh-columns,.aurebesh-pagesel,.aurebesh-cellborder{height:40px}
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
/* the link box is one row, so that it stays small where it hangs on the text */
.aurebesh-link-form{flex-direction:row;align-items:center;gap:4px;width:max-content;max-width:min(420px,calc(100vw - 24px))}
.aurebesh-link-form input{flex:1 1 auto;min-width:160px}
.aurebesh-media-form button{padding:5px 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px}
.aurebesh-status{padding:5px 10px;border-top:1px solid var(--aurebesh-border,#d0d5dd);background:var(--aurebesh-toolbar-bg,#f8f9fb);font-size:12px}
.aurebesh-status[hidden]{display:none}
/* the footer: the numbers on the left, the switch between the views on the right */
.aurebesh-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--aurebesh-border,#d0d5dd);background:var(--aurebesh-toolbar-bg,#f8f9fb)}
.aurebesh-footer:not(:has(>:not([hidden]))){display:none}
.aurebesh-count{padding:6px 12px;font-size:12px;color:var(--aurebesh-label,#667085);text-align:start}
.aurebesh-modes{display:flex;gap:2px;margin-inline-start:auto;padding:4px 8px}
.aurebesh-mode{padding:3px 10px;border:0;border-radius:6px;background:transparent;color:var(--aurebesh-label,#667085);cursor:pointer;font:inherit;font-size:12px}
.aurebesh-mode:hover{background:var(--aurebesh-hover,rgba(0,0,0,.06))}
.aurebesh-mode[aria-checked="true"]{background:var(--aurebesh-active-bg,#e0e9ff);color:var(--aurebesh-active-color,#1d4ed8);font-weight:600}
.aurebesh-mode:focus-visible{outline:2px solid var(--aurebesh-accent,#2563eb);outline-offset:1px}
/* the HTML and Markdown views: the text as text, with the toolbar out of use */
.aurebesh-source{display:block;width:100%;box-sizing:border-box;min-height:var(--aurebesh-min-height,150px);max-height:var(--aurebesh-max-height,none);margin:0;padding-block:var(--aurebesh-pad-y,10px);padding-inline:max(var(--aurebesh-pad-x,12px),calc((100% - var(--aurebesh-text-width,100%)) / 2));border:0;outline:0;overflow:auto;resize:none;background:transparent;color:inherit;font:13px/1.6 ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,'DejaVu Sans Mono',monospace;tab-size:2}
.aurebesh-source[hidden]{display:none}
.aurebesh-source-mode .aurebesh-toolbar,.aurebesh-source-mode .aurebesh-quickbar{opacity:.5}
.aurebesh:not([data-page]) .aurebesh-body>.aurebesh-stage>.aurebesh-source{flex:1 1 auto}
.aurebesh-count[hidden]{display:none}
.aurebesh-count.over{color:#b42318;font-weight:600}
.aurebesh-status.error{color:#b42318;background:#fef3f2}
.aurebesh-content :not(pre)>code{padding:var(--aurebesh-code-padding,1px 5px);border:1px solid var(--aurebesh-code-border,rgba(0,0,0,.1));border-radius:var(--aurebesh-code-radius,4px);background:var(--aurebesh-code-bg,#f3f4f6);color:var(--aurebesh-code-color,inherit);font-size:.9em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
/* the line keeps its height with a superscript or a subscript, whatever the size of the text */
.aurebesh-content sup,.aurebesh-content sub{font-size:.75em;line-height:0}
.aurebesh-size{max-width:90px}
.aurebesh-weight{max-width:110px}
.aurebesh-codelang{max-width:120px}
.aurebesh-code-tools{align-items:center;gap:8px}
.aurebesh-tools-label{margin-inline-end:8px;color:var(--aurebesh-label,#667085);font-size:12px;white-space:nowrap}
/* the language of a code block, in its corner */
.aurebesh-content pre[data-language]{position:relative}
.aurebesh-content pre[data-language]::before{content:attr(data-language);position:absolute;top:3px;inset-inline-end:8px;color:var(--aurebesh-label,#667085);font:600 10px system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;pointer-events:none;user-select:none;-webkit-user-select:none}
.aurebesh{position:relative}
/* a popover on the link: see placeLinkTools */
.aurebesh-link-tools{position:absolute;z-index:20;align-items:center;flex-wrap:nowrap;gap:2px;width:max-content;max-width:min(440px,calc(100% - 8px));box-sizing:border-box;padding:3px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:6px;box-shadow:0 4px 14px rgba(16,24,40,.16)}
.aurebesh-link-url{unicode-bidi:plaintext;flex:1 1 auto;min-width:0;max-width:260px;padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--aurebesh-accent,#2563eb)}
.aurebesh-link-tools button{padding:0 10px}
.aurebesh-pending{display:inline-block;min-width:120px;padding:18px 12px;margin:2px;border:1px dashed var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-toolbar-bg,#f8f9fb);color:#667085;font-size:13px;text-align:center;vertical-align:middle;user-select:none}
.aurebesh-pending::before{content:attr(data-label)}
.aurebesh-image-tools{align-items:center}
.aurebesh-alt{flex:1;min-width:120px;max-width:260px;height:28px;padding:0 8px;border:1px solid var(--aurebesh-border,#d0d5dd);border-radius:4px;background:var(--aurebesh-bg,#fff);color:inherit;font:inherit;font-size:13px}
.aurebesh-content{min-height:var(--aurebesh-min-height,150px);max-height:var(--aurebesh-max-height,none);line-height:var(--aurebesh-line,inherit);padding-block:var(--aurebesh-pad-y,10px);padding-inline:max(var(--aurebesh-pad-x,12px),calc((100% - var(--aurebesh-text-width,100%)) / 2));outline:0;overflow:auto}
/* A page format: the content becomes a sheet of that width on a desk; with a height, page breaks are marked every page. */
.aurebesh[data-page] .aurebesh-stage{max-height:var(--aurebesh-max-height,none);padding:16px;overflow:auto;background:var(--aurebesh-desk,#e4e7ec)}
.aurebesh[data-page] .aurebesh-content{box-sizing:border-box;max-height:none;width:var(--aurebesh-page-w);max-width:100%;min-height:var(--aurebesh-page-h,var(--aurebesh-min-height,150px));margin:0 auto;padding:var(--aurebesh-page-m);overflow:visible;background-color:var(--aurebesh-bg,#fff);box-shadow:0 1px 4px rgba(0,0,0,.3)}
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
/* Every block finds its own direction from its first strong letter (Arabic, Hebrew); a dir attribute overrides it. */
.aurebesh-content:not([dir]),.aurebesh-content :is(p,h1,h2,h3,blockquote,li,td,th):not([dir]){unicode-bidi:plaintext}
.aurebesh-content pre{direction:ltr;text-align:left}
.aurebesh-content pre[dir=rtl]{direction:rtl;text-align:right}
.aurebesh-content :is(ul,ol)[dir=rtl]{padding-inline-start:40px}
` + calloutCss(DEFAULT_CALLOUTS) + taskListCss() + `.aurebesh-content ul[data-task]>li::before{cursor:pointer}
`;
