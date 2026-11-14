'use strict';

// Locate the existing control; activation and write authority stay with its owner.
function findControls(query, root = document) {
  const terms = query.trim().toLowerCase().split(/\s+/);
  if (!terms[0]) return [];
  const found = [];
  for (const control of root.querySelectorAll('button, input:not([type="hidden"]), select, textarea, summary')) {
    if (control.closest('dialog, .launch-controls, .shared-workspace-header, .viewer-icon-toolbar, .viewer-dropdown-toolbar, .ikemaker-universal-toolbar, [hidden], [inert], [aria-hidden="true"], [data-control-search-launch]')) continue;
    // Closed disclosure panels can be expanded. Other inactive modes stay owned by their viewer.
    
    const label = control.getAttribute('aria-label') || Array.from(control.labels || []).map(l => l.textContent.trim()).join(' ') ||
      (['BUTTON','SUMMARY'].includes(control.tagName) && control.textContent.trim()) || control.title || control.placeholder;
    if (!label) continue;
    const panels = [];
    for(let d=control.closest('details');d;d=d.parentElement?.closest('details')){
      const heading=d.querySelector(':scope > summary');
      if(heading && heading!==control)panels.unshift(heading.textContent.trim());
    }
    const context = panels.join(' › ');
    const haystack = [label,control.title,context].join(' ').toLowerCase();
    if (!terms.every(term=>haystack.includes(term))) continue;
    if (!control.getClientRects().length && !control.closest('details:not([open])')) continue;
    found.push({control,label,context});
  }
  return found;
}

function appendResults(results, matches, go) {
  for (const {control,label,context} of matches) {
    const row=document.createElement('div'), button=document.createElement('button');
    row.className='viewer-action-search-row';
    button.type='button';button.dataset.toolbarRun='true';
    const unavailable=control.matches(':disabled,[aria-disabled="true"]');
    button.textContent='Go to '+label+(context?' · '+context:'');
    button.onclick=()=>{
      if(!control.isConnected)return;
      go();
      for(let ancestor=control.closest('details');ancestor;ancestor=ancestor.parentElement?.closest('details'))ancestor.open=true;
      control.scrollIntoView({block:'center',inline:'nearest'});
      if(!unavailable)control.focus({preventScroll:true});
      else {
        const target=control.closest('details')?.querySelector('summary')||control.parentElement;
        if(target){if(target.tabIndex<0)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
      }
    };
    row.append(button);
    if(unavailable){
      const reason=document.createElement('small');
      const described=(control.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent.trim()).filter(Boolean).join(' ');
      reason.textContent=described||control.getAttribute('aria-description')||control.title||'Unavailable with the current selection.';
      row.append(reason);
    }
    results.append(row);
  }
}

function installBrowserSearch(find, append) {
  if(document.querySelector('[data-control-search-launch],.viewer-dropdown-toolbar'))return;
  const header=document.querySelector('header,.bar,.tools,footer');
  if(!header)return;
  const launch=document.createElement('button'),dialog=document.createElement('dialog'),input=document.createElement('input'),
    close=document.createElement('button'),results=document.createElement('div');
  launch.type=close.type='button';launch.dataset.controlSearchLaunch='';launch.textContent='Find control…';
  dialog.setAttribute('aria-label','Find a browser control');input.type='search';input.setAttribute('aria-label','Find a browser control');
  input.placeholder='Find a browser control';close.textContent='Close';
  Object.assign(dialog.style,{boxSizing:'border-box',maxWidth:'min(42rem, 95vw)',maxHeight:'85vh',overflow:'auto',backgroundColor:'var(--vscode-editor-background)',color:'var(--vscode-editor-foreground)'});
  input.style.maxWidth='75%';
  dialog.append(input,close,results);document.body.append(dialog);header.append(launch);
  function open(){if(!dialog.open)dialog.showModal();input.focus();input.select();}
  launch.onclick=open;close.onclick=()=>{dialog.close();launch.focus();};
  input.oninput=()=>{results.replaceChildren();const matches=find(input.value);append(results,matches,()=>dialog.close());if(input.value&&!matches.length)results.textContent='No matching controls in this browser view.';};
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter' && !e.isComposing){const first=results.querySelector('button');if(first){e.preventDefault();first.click();}}
    else if(e.key==='ArrowDown'){const first=results.querySelector('button');if(first){e.preventDefault();first.focus();}}
  });
  document.addEventListener('keydown',e=>{if(!e.defaultPrevented&&e.altKey&&!e.ctrlKey&&!e.shiftKey&&e.key.toLowerCase()==='a'){e.preventDefault();open();}});
}
const browserScript = () => ';('+installBrowserSearch.toString()+')('+findControls.toString()+','+appendResults.toString()+');';
module.exports={findControls,appendResults,browserScript};
