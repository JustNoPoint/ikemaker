'use strict';
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const model = require('./snd_audio_processing');
const {
    soundBuffer,
    wavInfo
} = require('./snd_reader');

const SETTINGS_KEY = 'ikemen.snd.effectPreferences';
const effectDefaults = {
    volume:{percent:125,crossfadeMilliseconds:5}, normalize:{crossfadeMilliseconds:5},
    reverse:{crossfadeMilliseconds:5}, loudness:{amount:50,crossfadeMilliseconds:5},
    pitch:{semitones:3,crossfadeMilliseconds:5}, tempo:{percent:125,crossfadeMilliseconds:5},
    speed:{percent:125,crossfadeMilliseconds:5}, fadeIn:{seconds:.1,equalPower:0}, fadeOut:{seconds:.1,equalPower:0},
    echo:{seconds:.25,decayPercent:50,repeats:3,autoRepeats:0,echoThresholdDb:-40}, trimSilence:{thresholdDb:-40},
    insertSilence:{leadingSeconds:.1,trailingSeconds:.1}, resample:{rate:22050},
    downsample:{rate:44100}, bitDepth:{bits:16,dither:0}
};

function numericSettings(operation, options) {
    const values = {};
    for (const [key, fallback] of Object.entries(effectDefaults[operation] || {})) {
        const value = options?.[key];
        values[key] = value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
    }
    return values;
}

function availableEncoder(command) {
    if (typeof command !== 'string' || !command) return false;
    const direct = path.isAbsolute(command) || command.includes('/') || command.includes(path.sep);
    const directories = direct ? [''] : (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const names = process.platform === 'win32' && !path.extname(command) ? [command + '.exe', command] : [command];
    return directories.some(dir => names.some(name => {
        const file = dir ? path.join(dir, name) : name;
        try {
            fs.accessSync(file, fs.constants.X_OK);
            return fs.statSync(file).isFile();
        } catch { return false; }
    }));
}

function html(archive, indices, range = {}, preferences = {}, encoderReady = true) {
    const remembered = Object.fromEntries(Object.keys(effectDefaults).map(operation => [operation, numericSettings(operation, preferences[operation])]));
    const escape = value => String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));
    return `<!doctype html><html><head><style>body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:16px}label{display:inline-flex;flex-direction:column;margin:8px}input,select,button{padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-panel-border))}button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:disabled{opacity:.5}audio{display:block;width:100%;max-width:600px}.options{display:flex;flex-wrap:wrap}pre{white-space:pre-wrap}[hidden]{display:none!important}</style></head><body><h1>Process Audio · Review</h1><p id="selectedSoundIds">Selected IDs: ${indices.map(i=>escape(archive.entries[i].identity)).join(' · ')}</p><p>Preview creates derived WAV samples. Apply changes this SND binary only; source WAVs and build manifests remain unchanged. Rebuilding from the original manifest restores its sources.</p>${encoderReady?'':'<p role="status">Pitch, tempo, speed, resampling, bit depth and downsampling require FFmpeg. Set the FFmpeg path in IKeMaker settings and reopen Process Audio.</p>'}<label>Operation<select id="operation">${Object.entries(model.OPERATIONS).map(([id,label])=>`<option value="${id}"${!encoderReady && model.FFMPEG_OPERATIONS.includes(id) ? ' disabled' : ''}>${label}</option>`).join('')}</select></label><label><input id="all" type="checkbox">For Downsample Above Rate, inspect the entire archive</label><div class="options"><label><input id="range" type="checkbox">Apply effect only to selected range</label><label>Edge crossfade milliseconds<input id="crossfadeMilliseconds" type="number" value="5" min="0" max="100" step=".1"></label><label>Volume / tempo / speed percent<input id="percent" type="number" value="125" min="0" max="1000"></label><label>Loudness amount<input id="amount" type="number" value="50" min="1" max="100"></label><label>Pitch semitones<input id="semitones" type="number" value="3" min="-24" max="24" step=".1"></label><label>Fade curve<select id="equalPower"><option value="0">Linear</option><option value="1">Equal power</option></select></label><label>Fade / echo / silence seconds<input id="seconds" type="number" value=".1" step=".01" min="0" max="30"></label><label>Echo decay percent<input id="decayPercent" type="number" value="50" min="0" max="100"></label><label>Repeat mode<select id="autoRepeats"><option value="0">Fixed count</option><option value="1">Until quiet (up to 16)</option></select></label><label>Echo cutoff (dBFS)<input id="echoThresholdDb" type="number" min="-100" max="0" value="-40"></label><label>Echo repeats<input id="repeats" type="number" value="3" min="1" max="16"></label><label><input id="echoSelection" type="checkbox">Echo only selected range</label><label>Sample rate / threshold Hz<input id="rate" type="number" value="22050" min="4000" max="192000"></label><label>Dither when reducing bit depth<select id="dither"><option value="0">Off</option><option value="1">Triangular (TPDF)</option></select></label><label>Bits<select id="bits"><option>8</option><option selected>16</option><option>24</option></select></label><label>Selection start seconds<input id="start" type="number" value="${Number(range.start)||0}" step=".000001" min="0"></label><label>Selection end seconds<input id="end" type="number" value="${Number(range.end)||archive.entries[indices[0]].wav.durationSeconds}" step=".000001" min="0"></label><label>Silence threshold dB<input id="thresholdDb" type="number" value="-50" min="-100" max="0"></label><label>Leading silence seconds<input id="leadingSeconds" type="number" value=".1" min="0" max="60" step=".01"></label><label>Trailing silence seconds<input id="trailingSeconds" type="number" value=".1" min="0" max="60" step=".01"></label></div><p>Pitch preserves duration; tempo preserves pitch; speed changes both. Loudness uses linked attack/release envelope gain with the original peak preserved. LUFS is gated K-weighted integrated loudness; silent/below-gate audio is reported separately. Gain and echo can clip. Fades reach zero at their respective endpoint. Selection uses floor(start) / ceil(end) sample boundaries. Selected effects preserve all outside samples; tempo/speed relocate the unchanged suffix. Default edge crossfade is 5 ms, clamped for short ranges and skipped at file boundaries; range fades use no edge crossfade. Echo mixes selected repeats into the underlying sound. Format conversions, trimming and silence insertion affect the whole entry.</p><button id="preview">Preview operation</button><button id="apply" disabled>Apply reviewed audio to SND</button><button id="keep" disabled>Keep preview in edit chain</button><button id="commitChain" disabled>Commit kept edits</button><button id="resetChain" disabled>Reset kept edits</button><button id="saveDerived" disabled>Save derived WAV…</button><button id="cancel">Cancel</button><pre id="status" role="status"></pre><label>Audition affected ID<select id="sound"></select></label><h2>Original</h2><audio id="original" controls></audio><button data-play="original">Play</button><button data-stop="original">Stop</button><label><input data-loop="original" type="checkbox">Loop original</label><h2>Processed WAV</h2><audio id="processed" controls></audio><button data-play="processed">Play</button><button data-stop="processed">Stop</button><label><input data-loop="processed" type="checkbox">Loop processed</label><script>
 const vscode=acquireVsCodeApi(),q=id=>document.getElementById(id);let revision=0,review=null,chainRevision=0,previewInFlight=null;
 const fields=['operation','all','range','crossfadeMilliseconds','percent','amount','semitones','seconds','equalPower','decayPercent','autoRepeats','echoThresholdDb','repeats','echoSelection','rate','bits','dither','start','end','thresholdDb','leadingSeconds','trailingSeconds'];
 function invalidate(){revision++;review=null;q('apply').disabled=true;q('keep').disabled=true;q('saveDerived').disabled=true;q('processed').pause();q('processed').removeAttribute('src');q('status').textContent=previewInFlight===null?'Settings changed. Preview again before Apply.':'Settings changed. Waiting for the previous preview to finish.'}
 const operationFields={reverse:['range','start','end','crossfadeMilliseconds'],normalize:['range','start','end','crossfadeMilliseconds'],volume:['percent','range','start','end','crossfadeMilliseconds'],loudness:['amount','range','start','end','crossfadeMilliseconds'],fadeIn:['seconds','equalPower','range','start','end'],fadeOut:['seconds','equalPower','range','start','end'],pitch:['semitones','range','start','end','crossfadeMilliseconds'],tempo:['percent','range','start','end','crossfadeMilliseconds'],speed:['percent','range','start','end','crossfadeMilliseconds'],echo:['seconds','decayPercent','autoRepeats','echoThresholdDb','repeats','range','start','end'],trimSilence:['thresholdDb'],trimSelection:['start','end'],insertSilence:['leadingSeconds','trailingSeconds'],resample:['rate'],bitDepth:['bits','dither'],downsample:['rate','all']};
 function showOptions(){const op=q('operation').value,visible=operationFields[op]||[];for(const id of fields)if(id!=='operation'){let show=visible.includes(id);if(id==='echoThresholdDb'&&q('autoRepeats').value!=='1'||id==='repeats'&&q('autoRepeats').value==='1')show=false;if(['start','end','crossfadeMilliseconds'].includes(id)&&op!=='trimSelection'&&!q('range').checked)show=false;if(id==='seconds'&&q('range').checked&&['fadeIn','fadeOut'].includes(op))show=false;q(id).closest('label').hidden=!show}q('percent').min=op==='volume'?0:25;q('percent').max=op==='volume'?1000:400}
 const settings=${JSON.stringify(remembered)};
 function loadEffectSettings(){for(const [id,value] of Object.entries(settings[q('operation').value]||{}))q(id).value=String(value)}
 fields.forEach(id=>q(id).onchange=()=>{if(id==='operation')loadEffectSettings();else if(Object.hasOwn(settings[q('operation').value]||{},id))settings[q('operation').value][id]=q(id).value;invalidate();showOptions()});loadEffectSettings();showOptions();
 q('keep').onclick=()=>vscode.postMessage({type:'keep',revision});q('commitChain').onclick=()=>vscode.postMessage({type:'commitChain',chainRevision,revision});q('resetChain').onclick=()=>{invalidate();vscode.postMessage({type:'resetChain',revision})};
 q('saveDerived').onclick=()=>vscode.postMessage({type:'saveDerived',revision,item:Number(q('sound').value)});
 for(const id of ['original','processed'])q(id).addEventListener('play',()=>q(id==='original'?'processed':'original').pause());
 q('preview').onclick=()=>{invalidate();previewInFlight=revision;q('preview').disabled=true;q('status').textContent='Preparing '+q('operation').selectedOptions[0].textContent+' preview…';const options={};for(const id of fields)options[id]=['all','echoSelection','range'].includes(id)?q(id).checked:q(id).value;vscode.postMessage({type:'preview',revision,options})};
 q('apply').onclick=()=>{q('apply').disabled=true;vscode.postMessage({type:'apply',revision})};q('cancel').onclick=()=>vscode.postMessage({type:'cancel'});
 function audition(){const item=review?.items[Number(q('sound').value)];if(!item)return;for(const id of ['original','processed']){q(id).pause();q(id).src=item[id]}}
 q('sound').onchange=audition;for(const button of document.querySelectorAll('[data-play]'))button.onclick=()=>q(button.dataset.play).play();for(const button of document.querySelectorAll('[data-stop]'))button.onclick=()=>{const audio=q(button.dataset.stop);audio.pause();audio.currentTime=0};for(const input of document.querySelectorAll('[data-loop]'))input.onchange=()=>q(input.dataset.loop).loop=input.checked;
 addEventListener('message',event=>{const message=event.data;if(previewInFlight!==null&&message.revision===previewInFlight&&['review','error'].includes(message.type)){previewInFlight=null;q('preview').disabled=false;if(message.revision!==revision)q('status').textContent='Settings changed. Preview again before Apply.'}if(message.revision!==revision)return;if(message.type==='chain'){chainRevision=message.chainRevision;q('commitChain').disabled=!message.count;q('resetChain').disabled=!message.count;q('keep').disabled=true;q('status').textContent=message.count+' kept operation(s). Preview another operation on the kept result, commit, or reset.';return}if(message.type==='saved'){q('status').textContent='Saved derived WAV: '+message.path;return}if(message.type==='error'){q('status').textContent=message.message;return}if(message.type==='review'){if(message.selectedIds)q('selectedSoundIds').textContent='Selected IDs: '+message.selectedIds.join(' \u00b7 ');review=message;q('status').textContent=message.summary;q('sound').textContent='';message.items.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.identity;q('sound').append(option)});audition();q('keep').disabled=false;q('apply').disabled=false;q('saveDerived').disabled=false}});
 vscode.postMessage({type:'recoveryReady'});
 </script></body></html>`;
}

function open({
    archive,
    indices,
    range,
    storage,
    apply
}) {
    const panel = vscode.window.createWebviewPanel('ikemenSndAudioProcessing', 'Process Audio · Review', vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    require('./viewer_group').trackViewerPanel(panel);
    const encoder = vscode.workspace.getConfiguration('ikemenZss', vscode.Uri?.file?.(archive.filename)).get('ffmpegPath', 'ffmpeg') || 'ffmpeg';
    const encoderReady = availableEncoder(encoder);
    async function remember(result) {
        if (!storage || !result?.preferences) return;
        try {
            await storage.update(SETTINGS_KEY, {...storage.get(SETTINGS_KEY), ...result.preferences});
        } catch (error) {
            vscode.window.showWarningMessage('Audio saved. IKeMaker could not remember the effect settings: '+error.message);
        }
    }
    let pending = null,
        kept = null,
        chainRevision = 0,
        chainCount = 0,
        disposed = false,
        cancellation = new AbortController(),
        busy = false;
    const recovery=require('./media_recovery_snapshots');
    const recoveryEnabled=recovery.enabled(vscode,archive.filename);
    const recoveryStore=recovery.current();
    let recoveryHash=null,recoveryOffered=false,recoveryPaused=false;
    function snapshot(result,count){
        if(recoveryPaused||!recoveryEnabled||!recovery.enabled(vscode,archive.filename)||!result)return;
        try {
        recoveryHash=recoveryStore.save(archive.filename,'snd-audio',model.hash(archive.buffer),{
            replacements:[...result.replacements].map(([index,bytes])=>[index,bytes.toString('base64')]),
            indices,count,operation:result.operation,preferences:result.preferences||{}
        },recoveryHash);
        } catch(error) { recoveryPaused=true;vscode.window.showWarningMessage('Audio recovery snapshot unavailable: '+error.message+' Automatic recovery is paused in this panel; save or export edits explicitly then close and reopen Process Audio to review recovery.'); }
    }
    function clearSnapshot(){if(recoveryEnabled&&recoveryHash)recoveryStore.clear(archive.filename,'snd-audio',recoveryHash);recoveryHash=null;}
    panel.onDidDispose(() => {
        disposed = true;
        cancellation.abort();
        pending = null
    });
    panel.webview.onDidReceiveMessage(async message => {
        if (disposed) return;
        if (message.type === 'cancel') {
            try { clearSnapshot(); } catch(error) { vscode.window.showWarningMessage('Could not discard audio recovery: '+error.message); return; }
            panel.dispose();
            return;
        }
        if (busy) return;
        busy = true;
        try {
            if(message.type==='recoveryReady'&&recoveryEnabled&&recovery.enabled(vscode,archive.filename)&&!recoveryOffered){
                recoveryOffered=true;
                const saved=recoveryStore.read(archive.filename,'snd-audio',model.hash(archive.buffer));
                if(!saved)return;
                const answer=await vscode.window.showWarningMessage(saved.stale?'An audio recovery draft belongs to an older SND. It cannot be restored.':'Restore the retained Process Audio draft?',{modal:true,detail:saved.stale ? 'Discard Recovery removes the older draft. Cancel keeps it for later.' : 'Restore returns auditionable derived samples. Commit still requires review.'},...(saved.stale?['Discard Recovery']:['Restore Draft','Discard Recovery']));
                if(disposed)return;
                if(answer==='Restore Draft'||answer==='Discard Recovery'){
                    const latest=recoveryStore.read(archive.filename,'snd-audio',model.hash(archive.buffer));
                    if(latest?.snapshotHash!==saved.snapshotHash){
                        recoveryPaused=true;
                        vscode.window.showWarningMessage('The recovery draft changed while this prompt was open. Reopen the viewer to review the current draft.');
                        return;
                    }
                }
                if(answer==='Discard Recovery'){recoveryStore.clear(archive.filename,'snd-audio',saved.snapshotHash);return;}
                if(answer!=='Restore Draft'||saved.stale){recoveryPaused=true;vscode.window.showWarningMessage('The retained audio draft was kept. Automatic recovery is paused in this panel; save or export new edits explicitly. Close and reopen Process Audio to restore or discard the retained draft.');return;}
                if(model.hash(fs.readFileSync(archive.filename))!==saved.sourceHash)throw Error('The SND changed during recovery review.');
                const rows=saved.payload?.replacements;
                if(!Array.isArray(rows)||!rows.length||rows.length>archive.entries.length)throw Error('Invalid audio recovery entries.');
                const replacements=new Map();
                for(const row of rows){
                    if(!Array.isArray(row)||row.length!==2||!Number.isInteger(row[0])||!archive.entries[row[0]]||replacements.has(row[0])||typeof row[1]!=='string')throw Error('Invalid audio recovery entry.');
                    const bytes=Buffer.from(row[1],'base64');
                    if(bytes.toString('base64')!==row[1])throw Error('Invalid recovered WAV encoding.');
                    model.pcm(bytes);
                    replacements.set(row[0],bytes);
                }
                const bytes=model.replacePayloads(archive,replacements);model.verifyCandidate(archive,bytes,replacements);
                const restoredSelection=saved.payload.indices??[...replacements.keys()];
                if(!Array.isArray(restoredSelection)||!restoredSelection.length||restoredSelection.length>archive.entries.length||new Set(restoredSelection).size!==restoredSelection.length||restoredSelection.some(i=>!Number.isInteger(i)||!archive.entries[i]))throw Error('Invalid recovered sound selection.');
                kept={bytes,replacements,sourceHash:saved.sourceHash,operation:saved.payload.operation||'recovered',preferences:saved.payload.preferences||{},revision:0};
                indices=restoredSelection;pending=kept;chainCount=Math.max(1,Number(saved.payload.count)||1);chainRevision=1;recoveryHash=saved.snapshotHash;recoveryPaused=false;
                const formats = require('./wav_sample_formats');
                const items = [...replacements].map(([index, bytes]) => {
                    const entry = archive.entries[index];
                    return {
                        identity:entry.identity, info:wavInfo(bytes),
                        original:require('./snd_reader').wavDataUri(soundBuffer(archive,entry)),
                        processed:require('./snd_reader').wavDataUri(bytes)
                    };
                });
                const notices = items.map(item => {
                    const warning = formats.engineNotice(item.info);
                    return item.identity + ' · ' + formats.label(item.info) + (warning ? ' · ' + warning : '');
                });
                await panel.webview.postMessage({
                    type:'review', revision:0, selectedIds:indices.map(index=>archive.entries[index].identity),
                    summary:['Recovered derived audio. Audition before Commit.', ...notices].join('\n'), items
                });
                await panel.webview.postMessage({type:'chain',revision:0,chainRevision,count:chainCount});return;
            }
            if (message.type === 'keep') {
                if (!pending || pending.revision !== message.revision) throw Error('Preview current settings before keeping edits.');
                if (kept === pending) return;
                kept = pending;
                chainCount++;
                snapshot(kept,chainCount);
                chainRevision++;
                await panel.webview.postMessage({
                    type: 'chain',
                    revision: message.revision,
                    chainRevision,
                    count: chainCount
                });
            }
            if (message.type === 'resetChain') {
                clearSnapshot();
                kept = null;
                pending = null;
                chainCount = 0;
                chainRevision++;
                await panel.webview.postMessage({
                    type: 'chain',
                    revision: message.revision,
                    chainRevision,
                    count: 0
                });
            }
            if (message.type === 'preview') {
                pending = null;
                const options = {
                        ...message.options,
                        ffmpeg: encoder,
                        signal: cancellation.signal
                    },
                    operation = String(options.operation),
                    chosen = operation === 'downsample' && options.all === true ? archive.entries.map(e => e.archiveIndex) : indices;
                if (!encoderReady && model.FFMPEG_OPERATIONS.includes(operation)) throw Error('Set the FFmpeg path in IKeMaker settings and reopen Process Audio.');
                const working = kept ? require('./snd_reader').parseSndBuffer(kept.bytes, archive.filename) : archive;
                const result = await model.prepare(working, chosen, operation, options);
                const combined = new Map(kept?.replacements || []);
                for (const [index, bytes] of result.replacements) combined.set(index, bytes);
                result.replacements = combined;
                result.bytes = model.replacePayloads(archive, combined);
                result.sourceHash = model.hash(archive.buffer);
                if (disposed) return;
                pending = {
                    ...result,
                    preferences: {...kept?.preferences, [operation]: numericSettings(operation, options)},
                    operation,
                    revision: message.revision
                };
                snapshot(pending,chainCount+1);
                const items = [...result.replacements].map(([index, bytes]) => {
                    const entry = archive.entries[index],
                        info = wavInfo(bytes);
                    return {
                        identity: entry.identity,
                        original: require('./snd_reader').wavDataUri(soundBuffer(archive,entry)),
                        processed: require('./snd_reader').wavDataUri(bytes),
                        info
                    }
                });
                await panel.webview.postMessage({
                    type: 'review',
                    revision: message.revision,
                    items,
                    summary: `${chainCount} kept operation(s) + ${model.OPERATIONS[operation]}\nAffected IDs: ${items.map(x=>x.identity).join(' · ')}\n${archive.entries.length-items.length} excluded WAV payloads verified byte-for-byte after candidate reopen.\n${items.map(x=>`${x.identity}: ${x.info.sampleRate} Hz, ${x.info.bitsPerSample}-bit, ${x.info.channels} channel(s), ${x.info.durationSeconds.toFixed(6)} s`).join('\n')}\nLatest operation measurements:\n${result.reports.map(row=>`${row.identity}: ${row.status}${row.engineNotice?' · ENGINE: '+row.engineNotice:''} · ${row.inputEncoding} → ${row.outputEncoding}${/float|Extensible|32-bit/.test(row.outputEncoding)?' (audition uses a PCM16 preview copy; saved samples retain the displayed encoding)':''} · ${row.expectedFrames===undefined?row.frames+' frames':'expected '+row.expectedFrames+' frames, actual '+row.frames} · LUFS ${row.inputLufs===null?'silent/below gate':row.inputLufs.toFixed(2)} → ${row.outputLufs===null?'silent/below gate':row.outputLufs.toFixed(2)} · peak ${row.inputPeak.toFixed(5)} → ${row.outputPeak.toFixed(5)} · ${row.clippedSamples} clipped samples${row.overFullScaleSamples?' · '+row.overFullScaleSamples+' float samples over full scale (PCM conversion/playback may clip)':''}`).join('\n')}`
                });
            }
            if (message.type === 'saveDerived') {
                if (!pending || pending.revision !== message.revision) throw Error('Preview the current settings before exporting.');
                const entries = [...pending.replacements],
                    selected = entries[Number(message.item)];
                if (!selected) throw Error('Choose a reviewed sound to export.');
                const entry = archive.entries[selected[0]],
                    bytes = selected[1],
                    target = await vscode.window.showSaveDialog({
                        title: 'Save derived WAV',
                        defaultUri: vscode.Uri.file(path.join(path.dirname(archive.filename), entry.group + '_' + entry.index + '-' + pending.operation + (chainCount ? '-chain' : '') + '-derived.wav')),
                        filters: {
                            'Wave audio': ['wav']
                        }
                    });
                if (!target || disposed) return;
                fs.writeFileSync(target.fsPath, bytes, {
                    flag: 'wx'
                });
                if (!fs.readFileSync(target.fsPath).equals(bytes)) throw Error('Derived WAV failed reopen verification.');
                await remember(pending);
                await panel.webview.postMessage({
                    type: 'saved',
                    revision: message.revision,
                    path: target.fsPath
                });
            }
            if (message.type === 'commitChain') {
                if (!kept || message.chainRevision !== chainRevision) throw Error('Kept edits changed. Review them before Commit.');
                pending = {
                    ...kept,
                    revision: message.revision
                };
            }
            if (message.type === 'apply' || message.type === 'commitChain') {
                if (!pending || pending.revision !== message.revision) throw Error('Preview the current settings before Apply.');
                if (model.hash(fs.readFileSync(archive.filename)) !== pending.sourceHash) throw Error('The SND changed. Close this review and reopen Process Audio.');
                const reviewed = pending;
                model.verifyCandidate(archive, reviewed.bytes, reviewed.replacements);
                await apply(reviewed);
                model.verifyCandidate(archive, fs.readFileSync(archive.filename), reviewed.replacements);
                await remember(reviewed);
                try { clearSnapshot(); }
                catch(error) { vscode.window.showWarningMessage('Audio saved; recovery snapshot cleanup failed: '+error.message); }
                pending = null;
                panel.dispose();
            }
        } catch (error) {
            pending = null;
            if (disposed) return;
            await panel.webview.postMessage({
                type: 'error',
                revision: message.revision,
                message: error.message
            })
        } finally {
            busy = false
        }
    });
    panel.webview.html = require('./webview_policy').protect(html(archive, indices, range, storage?.get(SETTINGS_KEY) || {}, encoderReady), panel.webview.cspSource);
    return panel;
}
module.exports = {
    html,
    open
};
