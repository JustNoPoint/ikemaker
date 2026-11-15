'use strict';
function viewerScript() {
    return `
    const sndQuery=(()=>{${require('./snd_search').clientScript()};return{matches,audioFilter,sort};})();
    const soundRowsByIndex=new Map(model.entries.map(entry=>[entry.archiveIndex,entry]));
    const groupLabelsById=new Map(model.entries.map(entry=>[entry.group,entry.groupName]));
    for(const [value,label] of [['groupName','All sounds by group name'],['indexName','All sounds by index name']]){const option=document.createElement('option');option.value=value;option.textContent=label;soundSort.append(option)}
    if(['groupName','indexName'].includes(saved.soundSort))soundSort.value=saved.soundSort;
    const sndNameGroup=document.createElement('button');sndNameGroup.id='renameSoundGroup';sndNameGroup.textContent='Name Sound Group…';sndNameGroup.onclick=()=>vscode.postMessage({type:'renameSoundGroup',group:selected?selected.group:group});
    const sndNameIndex=document.createElement('button');sndNameIndex.id='renameSoundIndex';sndNameIndex.textContent='Name Sound Index…';sndNameIndex.onclick=()=>{if(selected)vscode.postMessage({type:'renameSoundIndex',index:selected.archiveIndex})};
    const nameBar=document.createElement('div');nameBar.className='toolbar';nameBar.setAttribute('aria-label','Sound names');
    const browseNames=document.createElement('button');browseNames.id='browseSoundNames';browseNames.textContent='Browse sound names…';
    document.getElementById('title').after(nameBar);nameBar.append(sndNameGroup,sndNameIndex,browseNames);
    const updateNameBar=()=>{const gid=selected?.group??group;const gn=groupLabelsById.get(gid),sn=selected?.indexName;
      sndNameGroup.textContent='Group '+(gid??'')+' · '+(gn||'Name group…');
      sndNameIndex.textContent='Index '+(selected?.index??'')+' · '+(sn||'Name index…');
      sndNameGroup.title='Edit sound group name';sndNameIndex.title='Edit sound index name';
      sndNameGroup.disabled=!!model.transfer||!groupLabelsById.has(gid);sndNameIndex.disabled=!!model.transfer||!selected;
    };
    const namesDialog=document.createElement('dialog');namesDialog.setAttribute('aria-label','Sound names');namesDialog.style.cssText='width:min(38rem,90vw);max-width:90vw;color:var(--vscode-foreground);background:var(--vscode-editor-background)';
    namesDialog.innerHTML='<h3>Sound names</h3><label>Find by group, index or name <input type="search"></label><select size="12" aria-label="Group and index names" style="width:100%;display:block;margin:8px 0"></select><button type="button">Open selected sound</button> <button type="button">Close</button>';
    document.body.append(namesDialog);
    const nameSearch=namesDialog.querySelector('input'),nameList=namesDialog.querySelector('select'),[openNamed,closeNames]=namesDialog.querySelectorAll('button');
    const listNames=()=>{const terms=nameSearch.value.toLowerCase().trim().split(/\\s+/);nameList.replaceChildren();for(const entry of model.entries){const label='Group '+entry.group+' · '+(entry.groupName||'Unnamed group')+'  |  Index '+entry.index+' · '+(entry.indexName||'Unnamed index');if(!terms.every(t=>(entry.identity+' '+label).toLowerCase().includes(t)))continue;const option=new Option(label,String(entry.archiveIndex));nameList.add(option);if(entry.archiveIndex===selected?.archiveIndex)option.selected=true}if(nameList.selectedIndex<0&&nameList.length)nameList.selectedIndex=0;openNamed.disabled=!nameList.length};
    browseNames.onclick=()=>{nameSearch.value='';listNames();namesDialog.showModal();nameSearch.focus()};
    nameSearch.oninput=listNames;closeNames.onclick=()=>namesDialog.close();openNamed.onclick=()=>{const entry=soundRowsByIndex.get(Number(nameList.value));if(!entry||!nameList.length)return;namesDialog.close();group=entry.group;bucket=entry.category;select(entry);renderGroups();revealSoundEntry(entry.archiveIndex)};nameList.ondblclick=openNamed.onclick;nameList.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openNamed.click()}};
    document.getElementById('nameEvent').textContent='Name Shared Profile Event…';
    const soundRichFilter=document.createElement('select');soundRichFilter.id='soundRichFilter';soundRichFilter.setAttribute('aria-label','Audio and naming filter');
    for(const [value,label] of [['all','All audio / names'],['named','Named sounds'],['unnamed','Unnamed sounds'],['mono','Mono'],['stereo','Stereo'],['pcm','Integer PCM'],['float','Floating-point WAV'],['unreadable','Unreadable WAV'],['duplicate','Repeated identity or audio'],['clipping','Clipping / near clipping'],['silence','Leading / trailing silence'],['dc','DC offset']]){const option=document.createElement('option');option.value=value;option.textContent=label;soundRichFilter.append(option)}
    soundRichFilter.value=saved.soundRichFilter||'all';document.getElementById('soundSearch').after(soundRichFilter);
    const searchHelp=document.createElement('details');searchHelp.innerHTML='<summary>Sound search help</summary><p>Words match together; quote a phrase, prefix - to exclude, or use OR. Fields: group:, index:, name:, groupname:, indexname:, rate:, channels:, bits:, duration:, size:, format:, position:, source:, device:, start:, end:, is:. Start and end are seconds in the original recording. Numbers accept &gt;=22050 or 1..3. Example: stereo rate:&gt;=22050 -name:quiet. A sound search covers every group in the current archive.</p>';soundRichFilter.after(searchHelp);
    document.getElementById('soundSearch').placeholder='Names, phrases, group:7 rate:>=22050';
    const saveBeforeRichSearch=save;save=()=>{saveBeforeRichSearch();const state=vscode.getState()||{};state.soundRichFilter=soundRichFilter.value;vscode.setState(state);vscode.postMessage({type:'sndRetainedState',generation:model.generation,sourceFingerprint:model.sourceFingerprint,state})};
    matches=(entry,query)=>sndQuery.matches(entry,query)&&sndQuery.audioFilter(entry,soundRichFilter.value);
    visibleEntries=()=>{const mode=soundSort.value,searching=Boolean(document.getElementById('soundSearch').value.trim());let entries=model.entries.filter(entry=>searching?true:mode==='number'?entry.group===group:mode==='category'?entry.category===bucket:true);return Object.hasOwn(metadataSorts,mode)?entries.sort((a,b)=>compareSoundMetadata(a,b,mode,sndSortDirection.value)):sndQuery.sort(entries,mode,sndSortDirection.value)};
    const renderGroupsBeforeNames=renderGroups;
    renderGroups=()=>{if(['groupName','indexName'].includes(soundSort.value)){const root=document.getElementById('groups');root.textContent='';const note=document.createElement('p');note.textContent='All sounds · '+(soundSort.value==='groupName'?'group names':'index names')+' · display order only';root.append(note);return;}if(soundSort.value!=='number')return renderGroupsBeforeNames();const root=document.getElementById('groups'),query=document.getElementById('groupSearch').value.trim().toLowerCase();root.textContent='';for(const item of model.groups){const name=groupLabelsById.get(item.group)||'',label=item.group+(name?' · '+name:'');if(query&&!label.toLowerCase().includes(query))continue;const button=document.createElement('button');button.className='group'+(item.group===group?' selected':'');button.dataset.soundGroup=String(root.children.length);button.setAttribute('role','option');button.setAttribute('aria-selected',String(item.group===group));button.textContent=label+' · '+item.count;button.ondblclick=()=>vscode.postMessage({type:'renameSoundGroup',group:item.group});button.onclick=()=>{group=item.group;selected=null;renderGroups();renderEntries();soundSelectionStatus();save()};root.append(button)}};
    const renderEntriesBeforeNames=renderEntries;renderEntries=()=>{const result=renderEntriesBeforeNames();for(const row of document.querySelectorAll('#entries [data-sound-archive-index]')){const entry=soundRowsByIndex.get(Number(row.dataset.soundArchiveIndex));if(entry?.groupName)row.textContent+=' · Group: '+entry.groupName;row.ondblclick=()=>vscode.postMessage({type:'renameSoundIndex',index:entry.archiveIndex})}updateNameBar();return result};
    const soundOrigin=document.createElement('p');soundOrigin.id='soundRecordingOrigin';document.getElementById('title').after(soundOrigin);
    function displayOrigin(entry){soundOrigin.hidden=!entry?.sourcePath;soundOrigin.textContent=entry?.sourcePath?['Source WAV',entry.sourceDevice,entry.sourcePath,entry.sourceRange].filter(Boolean).join(' · '):'';}
    displayOrigin(selected);
    const selectBeforeNames=select;select=entry=>{const result=selectBeforeNames(entry);displayOrigin(entry);if(entry?.groupName)document.getElementById('title').textContent+=' · Group: '+entry.groupName;return result};
    soundRichFilter.onchange=()=>{renderEntries();soundSelectionStatus();save()};
    const refreshRichSoundSort=()=>{sndSortDirectionLabel.hidden=false;sndSortDirectionLabel.firstChild.textContent='Sort order ';renderGroups();renderEntries();soundSelectionStatus();save()};soundSort.onchange=()=>{bucket=null;refreshRichSoundSort()};sndSortDirection.onchange=refreshRichSoundSort;sndSortDirectionLabel.hidden=false;
    renderGroups();renderEntries();soundSelectionStatus();
    `;
}

function browserScript() {
    return `
    const sndQuery=(()=>{${require('./snd_search').clientScript()};return{matches,audioFilter,sort};})();
    const soundRowsByIndex=new Map(model.entries.map(entry=>[entry.archiveIndex,entry]));
    const groupLabelsById=new Map(model.entries.map(entry=>[entry.group,entry.groupName]));
    const richSort=document.createElement('select');richSort.setAttribute('aria-label','Sort sound results');for(const [value,label] of [['source','Archive order'],['number','Group and index'],['groupName','Group name'],['name','Sound name'],['indexName','Index name'],['duration','Duration'],['rate','Sample rate'],['channels','Channels'],['bits','Bit depth'],['size','Stored size']]){const option=document.createElement('option');option.value=value;option.textContent=label;richSort.append(option)}
    const richDirection=document.createElement('select');richDirection.setAttribute('aria-label','Sound sort direction');for(const value of ['asc','desc']){const option=document.createElement('option');option.value=value;option.textContent=value==='asc'?'Ascending':'Descending';richDirection.append(option)}
    const richAudio=document.createElement('select');richAudio.setAttribute('aria-label','Audio and naming filter');for(const [value,label] of [['all','All audio / names'],['mono','Mono'],['stereo','Stereo'],['named','Named'],['unnamed','Unnamed'],['duplicate','Duplicate'],['unreadable','Unreadable WAV'],['clipping','Clipping'],['silence','Silence at ends'],['dc','DC offset'],['pcm','Integer PCM'],['float','Floating-point WAV']]){const option=document.createElement('option');option.value=value;option.textContent=label;richAudio.append(option)}
    document.querySelector('.filters').append(richSort,richDirection,richAudio);richSort.value=saved.richSort||'source';richDirection.value=saved.richDirection||'asc';richAudio.value=saved.richAudio||'all';search.placeholder='Names, phrases, group:7 rate:>=22050';search.title='Words AND together; quoted phrases, -exclude, OR; fields group,index,name,groupname,indexname,rate,channels,bits,duration,size,position,source,device,start,end,is. Start and end are seconds in the original recording.';
    for(const option of group.options){if(!option.value)continue;const label=groupLabelsById.get(Number(option.value));if(label)option.textContent+=' · '+label}
    const persistBeforeRich=persist;persist=()=>{persistBeforeRich();vscode.setState({...vscode.getState(),richSort:richSort.value,richDirection:richDirection.value,richAudio:richAudio.value})};
    visible=()=>sndQuery.sort(model.entries.filter(item=>sndQuery.matches(item,search.value)&&sndQuery.audioFilter(item,richAudio.value)&&(!group.value||item.group===Number(group.value))&&(!category.value||item.category===category.value)&&(!named.value||(item.namedBuckets||[]).includes(named.value))),richSort.value,richDirection.value);
    const renderBeforeNames=render;render=()=>{renderBeforeNames();for(const row of results.querySelectorAll('[data-archive-index]')){const item=soundRowsByIndex.get(Number(row.dataset.archiveIndex));if(!item)continue;
      const primary=row.querySelector('.primary');primary.replaceChildren();
      if(marked.has(item.archiveIndex))primary.append('✓ ');
      for(const [kind,id,name] of [['group',item.group,item.groupName],['index',item.index,item.indexName]]){
        const label=document.createElement('span');label.dataset.soundNameKind=kind;
        label.textContent=(kind==='group'?'Group ':'Index ')+id+(name?' · '+name:'');
        if(!model.transfer){label.title='Right-click to rename '+kind;label.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();vscode.postMessage({type:'renameLabel',kind,filename:model.filename,generation:model.generation,index:item.archiveIndex,group:item.group,number:item.index})}}
        if(kind==='index')primary.append('  |  ');primary.append(label);
      }
      if(!item.indexName&&item.name)row.querySelector('.meta').prepend(item.name+' · ');
    }};
    for(const field of [richSort,richDirection,richAudio])field.onchange=()=>{persist();render()};render();persist();
    `;
}
module.exports = { viewerScript, browserScript };
