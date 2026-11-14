'use strict';

// Body reachability complements toolbar_access's reversible row movement.
// Full chrome remains a scrollable fallback when it cannot fit above the body.
function style(){return `
.shared-workspace-header{flex-shrink:0;min-width:0}.launch-controls>:not(style){flex-shrink:0}
html.ikm-short-pane:not(.ikm-toolbar-compact) .launch-controls{max-height:45vh;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-width:thin}
html.ikm-short-pane .shared-workspace-header~.app{min-height:0;overflow:auto}
html.ikm-short-pane :where(main,[role="main"],.app){scroll-padding-top:var(--ikm-visible-header-height,0px)}
.ikm-toolbar-bar{flex-wrap:wrap;position:sticky;top:0;z-index:10015;background:var(--vscode-editor-background)}.ikm-toolbar-more-options>button{white-space:normal}
`;}
function clientScript(){return `(${install.toString()})();`;}
function install(){
 if(globalThis.ikemakerCompactHeaderBound)return;globalThis.ikemakerCompactHeaderBound=true;
 const root=document.documentElement,header=document.querySelector?.('.launch-controls');if(!header||typeof header.getAttribute!=='function'||typeof header.getBoundingClientRect!=='function'||typeof root?.classList?.toggle!=='function'||typeof ResizeObserver!=='function'||typeof MutationObserver!=='function')return;
 const originalTabindex=header.getAttribute('tabindex');
 const update=()=>{const short=innerWidth<=700||innerHeight<=540;root.classList.toggle('ikm-short-pane',short);const rect=header.getBoundingClientRect();root.style.setProperty('--ikm-visible-header-height',Math.max(0,Math.min(rect.bottom,innerHeight*.5))+'px');const capped=short&&!root.classList.contains('ikm-toolbar-compact');if(capped)header.tabIndex=0;else if(originalTabindex===null)header.removeAttribute('tabindex');else header.setAttribute('tabindex',originalTabindex)};
 let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update()})};
 addEventListener('resize',schedule);new ResizeObserver(schedule).observe(header);new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['class']});
 document.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||header.contains(target)||target.closest('.ikm-toolbar-more,.viewer-dropdown,.viewer-toolbar-dialog'))return;const left=scrollX,top=scrollY;requestAnimationFrame(()=>{if(document.activeElement!==target||scrollX!==left||scrollY!==top)return;const rect=target.getBoundingClientRect(),head=header.getBoundingClientRect(),covered=head.bottom>rect.top&&head.top<rect.bottom;if(covered||rect.bottom>innerHeight||rect.top<0)target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})})});
 update();
}
module.exports={style,clientScript};
