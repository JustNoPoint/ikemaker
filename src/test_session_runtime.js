'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWriteSet } = require('./mutation_safety');

const MODULE_RELATIVE = 'external/mods/IKEMaker_test_session.lua';
const SESSION_ROOT = '.ikemen/test-sessions';

function luaString(value) { return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n')}'`; }
function luaValue(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `{${value.map(luaValue).join(', ')}}`;
  return luaString(value);
}
function luaRecords(records, fields) {
  const key = field => field === 'function' ? "['function']" : field;
  return `{\n${records.map(record => `\t{${fields.map(field => `${key(field)} = ${luaValue(record[field])}`).join(', ')}}`).join(',\n')}\n}`;
}
function moveRuntimeLua(session) {
  const move = session.moveRun;
  if (!move || move.kind !== 'move-repeat') throw new Error('A reviewed move-repeat plan is required.');
  const prefix = `save/logs/IKEMaker-${String(session.id).replace(/[^a-z0-9_-]/gi, '_')}`;
  return `-- One-use IKEMaker move test. No character source is changed.
local bootstrapPath = ${luaString(MODULE_RELATIVE)}
os.remove(bootstrapPath)
local test = {stateNo=${move.stateNo}, distance=${move.distance}, tolerance=${move.distanceTolerance}, facing=${move.facing}, idleState=${move.idleState}, expectedSpawn=${luaString(move.expectedSpawn)}, expectedPeakIncrease=${move.expectedPeakIncrease??'nil'}, sourceDigest=${luaString(move.sourceDigest)}, natural=${move.mode==='natural'?'true':'false'}, commandName=${luaString(move.commandName||'')}}
local sessionId=${luaString(session.id)}
local resultPrefix=${luaString(prefix)}
local visible=true
local runIndex=0
local run=nil
local autoArmed=${move.autoRunOnce !== false ? 'true' : 'false'}
local tick=0
local message=${luaString(move.autoRunOnce !== false ? 'Waiting for reviewed distance, facing, actors, and stage; first run starts once.' : 'Set reviewed distance and facing, then press Shift+F6.')}
local hotkeys={}
local inputKeys={'B','D','F','U','L','R','a','b','c','x','y','z','s','d','w','m'}
local font=fontNew(gameOption('Debug.Font'), 8)
local sprite=textImgNew()
textImgSetFont(sprite,font)
textImgSetScale(sprite,0.5,0.5)
local function draw(y,label)
  textImgReset(sprite, {'pos','text','palfx'})
  textImgSetColor(sprite,255,255,255,255)
  textImgAddPos(sprite,8,y)
  textImgSetText(sprite,label)
  textImgDraw(sprite)
end
local function sample()
  if not player(1) then return nil end
  local p1Slot=getSelectNo()
  local p1Def=''
  if p1Slot>=0 then local ok,value=pcall(getCharFileName,p1Slot);if ok then p1Def=value end end
  local p1={state=stateNo(), stance=stateType(), ctrl=ctrl(), facing=facing(), y=posY(), life=life(), power=power(), palette=palNo(), def=p1Def}
  local observed={state=p1.state,ctrl=p1.ctrl,facing=p1.facing,distance=math.abs(p2DistX()),helper=numHelper(),projectile=numProj(),explod=numExplod(),hit=moveHit(),guarded=moveGuarded(),p1=p1,gameTick=gameTime(),round=roundNo(),roundState=roundState(),stageDef=''}
  if player(2) then
    local p2Slot=getSelectNo()
    local p2Def=''
    if p2Slot>=0 then local ok,value=pcall(getCharFileName,p2Slot);if ok then p2Def=value end end
    observed.p2={state=stateNo(),stance=stateType(),ctrl=ctrl(),facing=facing(),y=posY(),life=life(),power=power(),palette=palNo(),def=p2Def}
  else observed.p2={state=-1,stance='',ctrl=false,facing=0,y=0,life=0,power=0,palette=0,def=''} end
  local stageSlot=getStageNo()
  if stageSlot>0 then local ok,info=pcall(getStageInfo,stageSlot);if ok and type(info)=='table' then observed.stageDef=info.def or '' end end
  player(1)
  if test.natural then
    local ok,active=pcall(command,test.commandName)
    observed.command=ok and active or false
    observed.inputs={}
    for _,key in ipairs(inputKeys) do local valid,value=pcall(inputTime,key);if valid and type(value)=='number' then observed.inputs[key]=value end end
  end
  return observed
end
local function safeSample()
  local ok,value=pcall(sample)
  if not ok then message='Observation failed: '..tostring(value);return nil end
  return value
end
local function writeResult()
  if not run then return end
  local status='incomplete'
  local spawn=run.maxHelper>run.baseHelper or run.maxProjectile>run.baseProjectile or run.maxExplod>run.baseExplod
  local peaks={helper=math.max(0,run.maxHelper-run.baseHelper),projectile=math.max(0,run.maxProjectile-run.baseProjectile),explod=math.max(0,run.maxExplod-run.baseExplod)}
  local spawnPass=(test.expectedSpawn=='any') or (test.expectedSpawn=='none' and not spawn) or (test.expectedSpawn=='helper' and run.maxHelper>run.baseHelper) or (test.expectedSpawn=='projectile' and run.maxProjectile>run.baseProjectile) or (test.expectedSpawn=='explod' and run.maxExplod>run.baseExplod)
  if test.expectedPeakIncrease then spawnPass=spawnPass and peaks[test.expectedSpawn]==test.expectedPeakIncrease end
  if run.finished then status=test.natural and 'sampled' or ((run.entered and run.idle and spawnPass) and 'pass' or 'fail') end
  local filename=resultPrefix..'-run-'..tostring(runIndex)..'.json'
  local pending=filename..'.tmp'
  local f,err=io.open(pending,'w')
  if not f then printConsole('IKEMaker move result write failed: '..tostring(err)); return end
  local function bool(value) return value and 'true' or 'false' end
  f:write('{"schemaVersion":1,"kind":'..string.format('%q',test.natural and 'move-natural-attempt' or 'move-repeat')..',"sessionId":'..string.format('%q',sessionId)..',"runIndex":'..runIndex..',"sourceDigest":'..string.format('%q',test.sourceDigest)..',"status":'..string.format('%q',status))
  f:write(',"setup":{"opponent":'..string.format('%q',${luaString(move.opponent)})..',"stage":'..string.format('%q',${luaString(move.stage)})..',"distance":'..test.distance..',"facing":'..test.facing..',"observedP1Def":'..string.format('%q',run.start.p1.def)..',"observedP2Def":'..string.format('%q',run.start.p2.def)..',"observedStageDef":'..string.format('%q',run.start.stageDef)..'}')
  f:write(',"binding":'..${luaString(JSON.stringify(move.binding))}..',"sources":'..${luaString(JSON.stringify(move.sources))})
  f:write(',"assertions":{"state":{"expected":'..test.stateNo..',"observed":'..bool(run.entered)..'},"spawn":{"expected":'..string.format('%q',test.expectedSpawn)..',"expectedPeakIncrease":'..(test.expectedPeakIncrease or 'null')..',"observed":'..bool(spawn)..',"peakIncrease":{"helper":'..peaks.helper..',"projectile":'..peaks.projectile..',"explod":'..peaks.explod..'},"passed":'..bool(spawnPass)..'},"idle":{"expected":'..test.idleState..',"observed":'..bool(run.idle)..'}}')
  f:write(',"observations":{"ticks":'..run.ticks..',"maxHelper":'..run.maxHelper..',"maxProjectile":'..run.maxProjectile..',"maxExplod":'..run.maxExplod..',"moveHit":'..bool(run.hit)..',"moveGuarded":'..bool(run.guarded)..',"distanceAtStart":'..run.startDistance..',"facingAtStart":'..run.startFacing..',"gameTickAtStart":'..run.start.gameTick..',"roundAtStart":'..run.start.round..',"roundStateAtStart":'..run.start.roundState..',"p1StateAtStart":'..run.start.p1.state..',"p1StanceAtStart":'..string.format('%q',run.start.p1.stance)..',"p1YAtStart":'..run.start.p1.y..',"p1LifeAtStart":'..run.start.p1.life..',"p1PowerAtStart":'..run.start.p1.power..',"p1PaletteAtStart":'..run.start.p1.palette..',"p2StateAtStart":'..run.start.p2.state..',"p2StanceAtStart":'..string.format('%q',run.start.p2.stance)..',"p2FacingAtStart":'..run.start.p2.facing..',"p2YAtStart":'..run.start.p2.y..',"p2LifeAtStart":'..run.start.p2.life..',"p2PowerAtStart":'..run.start.p2.power..',"p2PaletteAtStart":'..run.start.p2.palette..',"lastState":'..run.lastState..',"lastCtrl":'..bool(run.lastCtrl)..',"finishReason":'..string.format('%q',run.finishReason)..',"rng":"uncontrolled"}')
  if test.natural then
    f:write(',"attempt":{"commandName":'..string.format('%q',test.commandName)..',"windowTicks":600,"commandActiveTicks":'..run.commandCount..',"commandFirstTick":'..(run.commandFirst or 'null')..',"stateFirstTick":'..(run.stateFirst or 'null')..',"startingState":'..run.start.p1.state..',"endingState":'..run.lastState..',"inputSamples":[')
    for index,key in ipairs(inputKeys) do local item=run.inputs[key];if index>1 then f:write(',') end;f:write('{"key":'..string.format('%q',key)..',"counterJumpCount":'..item.jumpCount..',"firstCounterJumpTick":'..(item.firstJump or 'null')..',"minValue":'..(item.minValue or 'null')..',"maxValue":'..(item.maxValue or 'null')..'}') end
    f:write(']}')
  end
  f:write('}\\n')
  f:close()
  local ok,renameErr=os.rename(pending,filename)
  if not ok then os.remove(pending); printConsole('IKEMaker move result replace failed: '..tostring(renameErr)); return end
  printConsole('IKEMaker move result: '..filename)
end
local function handleKey(action)
  if not gameMode('quickvs') and not gameMode('training') then return end
  if action=='hide' then visible=not visible; return end
  if action=='save' then writeResult(); return end
  if action~='run' then return end
  local observed=safeSample()
  if not observed then message='P1 is unavailable'; printConsole('IKEMaker move test: '..message); return end
  if observed.facing~=test.facing or math.abs(observed.distance-test.distance)>test.tolerance then
    message='Set distance '..test.distance..' +/- '..test.tolerance..' and facing '..test.facing..'; now '..observed.distance..', '..observed.facing
    printConsole('IKEMaker move test: place P1 facing '..test.facing..' at distance '..test.distance..' +/- '..test.tolerance..'; current distance '..observed.distance..', facing '..observed.facing)
    return
  end
  if run and not run.finished then message='Current run is still active'; printConsole('IKEMaker move test: '..message); return end
  runIndex=runIndex+1
  if observed.p1.stance~='S' or observed.p2.stance~='S' or not observed.p2.ctrl then printConsole('IKEMaker move test: non-standing or uncontrolled setup recorded; review contact manually.') end
  run={ticks=0,entered=false,idle=false,finished=false,baseHelper=observed.helper,baseProjectile=observed.projectile,baseExplod=observed.explod,maxHelper=observed.helper,maxProjectile=observed.projectile,maxExplod=observed.explod,hit=false,guarded=false,startDistance=observed.distance,startFacing=observed.facing,start=observed,lastState=observed.state,lastCtrl=observed.ctrl,finishReason='incomplete',commandCount=0,commandFirst=nil,stateFirst=nil,inputs={}}
  for _,key in ipairs(inputKeys) do run.inputs[key]={jumpCount=0,firstJump=nil,minValue=nil,maxValue=nil,last=nil} end
  if not test.natural then
    player(1)
    if not changeState(test.stateNo) then run.finished=true; run.finishReason='state-unavailable'; writeResult(); printConsole('IKEMaker move test: target state is unavailable.'); return end
    run.entered=stateNo()==test.stateNo
  end
  message='Run '..runIndex..' started'
end
_G.IKEMaker_move_test_key=function(action)
  local ok,err=pcall(handleKey,action)
  if not ok then message='Move test error: '..tostring(err); printConsole(message) end
end
for _,entry in ipairs({{'F6','run'},{'F7','save'},{'F8','hide'}}) do
  hotkeys[entry[2]]=addHotkey(entry[1],false,false,true,false,false,"IKEMaker_move_test_key('"..entry[2].."')")
  if not hotkeys[entry[2]] then printConsole('IKEMaker move test: Shift+'..entry[1]..' is unavailable') end
end
hook.add('loop','IKEMaker_move_repeat',function()
  if not gameMode('quickvs') and not gameMode('training') then return end
  tick=tick+1
  if autoArmed and not run then
    local ready=safeSample()
    if ready and ready.roundState==2 and ready.p1.ctrl and ready.p2.ctrl and ready.p1.state==test.idleState and ready.p2.state==test.idleState and ready.facing==test.facing and math.abs(ready.distance-test.distance)<=test.tolerance and string.lower(ready.p1.def)==string.lower(${luaString(move.character)}) and string.lower(ready.p2.def)==string.lower(${luaString(move.opponent)}) and string.lower(ready.stageDef)==string.lower(${luaString(move.stage)}) then
      autoArmed=false
      _G.IKEMaker_move_test_key('run')
    end
  end
  if run and not run.finished then
    local s=safeSample()
    if s then
      run.ticks=run.ticks+1
      run.entered=run.entered or s.state==test.stateNo
      if test.natural then
        if s.command then run.commandCount=run.commandCount+1;run.commandFirst=run.commandFirst or run.ticks end
        if s.state==test.stateNo then run.stateFirst=run.stateFirst or run.ticks end
        for _,key in ipairs(inputKeys) do local value=s.inputs[key];local item=run.inputs[key];if type(value)=='number' then if item.last~=nil and math.abs(value-item.last)~=1 then item.jumpCount=item.jumpCount+1;item.firstJump=item.firstJump or run.ticks end;item.last=value;item.minValue=math.min(item.minValue or value,value);item.maxValue=math.max(item.maxValue or value,value) end end
      end
      run.maxHelper=math.max(run.maxHelper,s.helper)
      run.maxProjectile=math.max(run.maxProjectile,s.projectile)
      run.maxExplod=math.max(run.maxExplod,s.explod)
      run.hit=run.hit or s.hit>0
      run.guarded=run.guarded or s.guarded>0
      run.lastState=s.state
      run.lastCtrl=s.ctrl
      run.idle=run.entered and run.ticks>2 and s.state==test.idleState and s.ctrl
      if (run.idle and (not test.natural or run.ticks>2)) or run.ticks>=600 then run.finished=true;run.finishReason=run.idle and 'returned-to-idle' or 'window-complete';message='Run '..runIndex..' '..run.finishReason;writeResult() end
    end
  end
  if not visible then return end
  local s=safeSample()
  if not s then draw(8,message);return end
  draw(8,'IKEMAKER MOVE TEST  State '..test.stateNo..'  source '..test.sourceDigest:sub(1,12))
  draw(18,'P1 distance '..(s and string.format('%.1f',s.distance) or '?')..' / '..test.distance..' +/- '..test.tolerance..'  facing '..(s and s.facing or '?')..' / '..test.facing)
  draw(28,(autoArmed and 'First run waits for setup   ' or '')..'Shift+F6 run again   Shift+F7 save   Shift+F8 hide  hotkey '..tostring(hotkeys.run))
  if run then draw(38,'Run '..runIndex..': '..(run.finished and 'complete' or 'observing')..'  state '..tostring(run.entered)..'  idle '..tostring(run.idle)..'  hit '..tostring(run.hit)) end
  if message~='' then draw(48,message) end
end)
`;
}
function runtimeLua(session) {
  if (session.kind === 'move-repeat') return moveRuntimeLua(session);
  const tests = luaRecords(session.tests || [], ['id', 'name', 'instruction', 'evidenceMask', 'suiteName']);
  const diagnostics = luaRecords(session.diagnostics || [], ['id', 'name', 'function', 'args', 'help']);
  const resultPath = `save/logs/IKEMaker-${String(session.id).replace(/[^a-z0-9_-]/gi, '_')}.json`;
  return `-- Generated by IKEMaker for one offline development launch.
-- The bootstrap removes itself after loading and must never ship with a game.
local bootstrapPath = ${luaString(MODULE_RELATIVE)}
local session = {
\tid = ${luaString(session.id)}, kind = ${luaString(session.kind)}, profile = ${luaString(session.profile)},
\tcharacter = ${luaString(session.character)}, stage = ${luaString(session.stage)}, createdAt = ${luaString(session.createdAt)},
\ttests = ${tests}, diagnostics = ${diagnostics}, resultPath = ${luaString(resultPath)}
}
os.remove(bootstrapPath)

local state = {visible = true, selected = 1, status = {}, notes = {}, diagnosticRuns = {}, lastMask = 0, written = false}
local font = fontNew(gameOption('Debug.Font'), 8)
local sprite = textImgNew()
textImgSetFont(sprite, font)
textImgSetScale(sprite, 0.5, 0.5)

local function hasBit(value, bit) return bit > 0 and math.floor(value / bit) % 2 == 1 end
local function containsMask(value, mask)
\tif mask <= 0 then return false end
\tfor bit = 0, 15 do local power = 2 ^ bit; if hasBit(mask, power) and not hasBit(value, power) then return false end end
\treturn true
end
local function currentMask()
\tlocal old = id(); local masks = {}
\tfor p = 1, 8 do if player(p) then table.insert(masks, var(59000)) end end
\tplayerId(old)
\tlocal union = 0
\tfor bit = 0, 15 do
\t\tlocal power = 2 ^ bit
\t\tfor _, value in ipairs(masks) do if hasBit(value, power) then union = union + power; break end end
\tend
\treturn union
end
local function jsonEscape(value)
\treturn tostring(value or ''):gsub('[%c"\\\\]', '_')
end
local function writeResults()
\tlocal pending = session.resultPath .. '.tmp'
\tos.remove(pending)
\tlocal file, err = io.open(pending, 'w')
\tif not file then printConsole('IKEMaker result write failed: ' .. tostring(err)); return end
\tfile:write('{\\n  "schemaVersion": 1,\\n  "sessionId": "' .. jsonEscape(session.id) .. '",\\n')
\tfile:write('  "kind": "' .. jsonEscape(session.kind) .. '",\\n  "profile": "' .. jsonEscape(session.profile) .. '",\\n')
\tfile:write('  "character": "' .. jsonEscape(session.character) .. '",\\n  "stage": "' .. jsonEscape(session.stage) .. '",\\n')
\tfile:write('  "completedAt": "' .. jsonEscape(tostring(getTimestamp())) .. '",\\n  "tests": [\\n')
\tfor index, test in ipairs(session.tests) do
\t\tlocal status = state.status[index] or 'not-run'
\t\tfile:write('    {"id":"' .. jsonEscape(test.id) .. '","name":"' .. jsonEscape(test.name) .. '","status":"' .. status .. '","evidenceMask":' .. tostring(test.evidenceMask or 0) .. ',"observedMask":' .. tostring(state.lastMask) .. '}')
\t\tif index < #session.tests then file:write(',') end
\t\tfile:write('\\n')
\tend
\tfile:write('  ],\\n  "diagnostics": [\\n')
\tlocal first = true
\tfor id, count in pairs(state.diagnosticRuns) do
\t\tif not first then file:write(',\\n') end; first = false
\t\tfile:write('    {"id":"' .. jsonEscape(id) .. '","executions":' .. tostring(count) .. '}')
\tend
\tfile:write('\\n  ]\\n}\\n'); file:close()
\tlocal published, err = os.rename(pending, session.resultPath)
\tif not published then os.remove(pending); printConsole('IKEMaker result replace failed: ' .. tostring(err)); return end
\tstate.written = true
\tprintConsole('IKEMaker results: ' .. session.resultPath)
end
local function draw(x, y, text, color)
\ttextImgReset(sprite, {'pos', 'text', 'palfx'}); textImgSetAlign(sprite, 1)
\ttextImgSetColor(sprite, color[1], color[2], color[3], 255); textImgAddPos(sprite, x, y)
\ttextImgSetText(sprite, text); textImgDraw(sprite)
end
local function safeCall(name)
\tlocal fn = _G[name]
\tif type(fn) ~= 'function' then printConsole('IKEMaker diagnostic unavailable: ' .. tostring(name)); return end
\tlocal ok, err = pcall(fn); if not ok then printConsole('IKEMaker diagnostic failed: ' .. tostring(err)) end
end
local function runDiagnostic(item)
\tlocal ai = item.id:match('^ai%-(%d+)$'); local player = item.id:match('^player%-(%d+)$')
\tif ai then pcall(toggleAI, tonumber(ai))
\telseif player then pcall(togglePlayer, tonumber(player))
\telseif item['function'] == 'standAll' then for p = 1, 8 do pcall(stand, p) end
\telseif item['function'] == 'fullRestore' then for p = 1, 8 do pcall(full, p) end; pcall(setTime, getRoundTime())
\telseif item['function'] == 'killP2' then for _, p in ipairs({2,4,6,8}) do pcall(kill, p) end
\telseif item['function'] == 'killP1' then for _, p in ipairs({1,3,5,7}) do pcall(kill, p) end
\telseif item['function'] == 'lifeOneAll' then for p = 1, 8 do pcall(kill, p, 1) end
\telseif item['function'] == 'powerMax' then pcall(powMax, 1); pcall(powMax, 2)
\telseif item['function'] == 'timeZero' then pcall(setTime, 0)
\telseif item['function'] == 'trainingReset' then pcall(resetRound); pcall(trainingReset)
\telseif item['function'] == 'reload' then pcall(reload); pcall(trainingReset)
\telseif item.id == 'debug-next' then pcall(toggleDebugDisplay, nil, false)
\telseif item.id == 'debug-clsn' then pcall(toggleDebugDisplay, nil, true)
\telseif item.id == 'debug-all' then pcall(toggleDebugDisplay, true, nil)
\telseif item.id == 'speed-up' then pcall(changeSpeed, 0.01)
\telseif item.id == 'speed-down' then pcall(changeSpeed, -0.01)
\telse safeCall(item['function']) end
\tstate.diagnosticRuns[item.id] = (state.diagnosticRuns[item.id] or 0) + 1
\twriteResults()
end
local function wrap(value, width)
\tlocal output, remaining = {}, tostring(value or '')
\twhile #remaining > width and #output < 3 do local cut = remaining:sub(1, width + 1):match('^.*()%s') or width; table.insert(output, remaining:sub(1, cut - 1)); remaining = remaining:sub(cut + 1) end
\tif remaining ~= '' then table.insert(output, remaining) end; return output
end

-- Engine hotkeys capture the key-down event even when a fast press ends before
-- the frame loop. Shift leaves the native F8/F9/F10 debug shortcuts untouched.
_G.IKEMaker_test_session_key = function(action)
\tif not gameMode('training') and not gameMode('quickvs') then return end
\tif action == 'hide' then state.visible = not state.visible; return end
\tif not state.visible then return end
\tlocal items = session.kind == 'diagnostic' and session.diagnostics or session.tests
\tif #items == 0 then return end
\tif action == 'next' then state.selected = state.selected % #items + 1
\telseif action == 'accept' then
\t\tif session.kind == 'diagnostic' then runDiagnostic(items[state.selected]) else state.status[state.selected] = 'pass'; writeResults() end
\telseif action == 'reject' and session.kind ~= 'diagnostic' then state.status[state.selected] = 'fail'; writeResults()
\telseif action == 'save' then writeResults() end
end
for _, entry in ipairs({{'F8','hide'}, {'F9','next'}, {'F10','accept'}, {'F11','reject'}, {'F7','save'}}) do
\tif not addHotkey(entry[1], false, false, true, false, false, "IKEMaker_test_session_key('" .. entry[2] .. "')") then
\t\tprintConsole('IKEMaker session shortcut unavailable: Shift+' .. entry[1])
\tend
end

hook.add('loop', 'IKEMaker_test_session', function()
\tif not gameMode('training') and not gameMode('quickvs') then return end
\tif not state.visible then return end
\tstate.lastMask = currentMask()
\tlocal items = session.kind == 'diagnostic' and session.diagnostics or session.tests
\tif #items == 0 then return end
\tlocal white, cyan, green, red, dim = {255,255,255}, {80,235,255}, {100,255,140}, {255,100,100}, {180,190,205}
\tdraw(8, 8, 'IKEMAKER ' .. string.upper(session.kind) .. ' SESSION  [' .. session.profile .. ']', cyan)
\tdraw(8, 16, string.format('%d/%d  %s', state.selected, #items, items[state.selected].name), white)
\tlocal description = session.kind == 'diagnostic' and items[state.selected].help or items[state.selected].instruction
\tfor line, text in ipairs(wrap(description, 86)) do draw(8, 16 + line * 8, text, dim) end
\tif session.kind == 'test' then
\t\tlocal status, mask = state.status[state.selected] or 'not-run', items[state.selected].evidenceMask or 0
\t\tlocal detected = containsMask(state.lastMask, mask)
\t\tdraw(8, 54, 'STATUS: ' .. string.upper(status) .. (detected and '  |  LOGGER EVIDENCE DETECTED' or ''), status == 'pass' and green or (status == 'fail' and red or white))
\t\tdraw(8, 64, 'Shift+F9 Next   Shift+F10 Pass   Shift+F11 Fail   Shift+F7 Save   Shift+F8 Hide', dim)
\telse
\t\tdraw(8, 54, 'Shift+F9 Next   Shift+F10 Execute   Shift+F7 Save   Shift+F8 Hide', dim)
\t\tdraw(8, 64, 'Pause/Scroll Lock retain IKEMEN native pause and frame-step behavior.', dim)
\tend
end)
`;
}

function installSession(root, session) {
  const modulePath = path.join(root, ...MODULE_RELATIVE.split('/'));
  const recordPath = path.join(root, SESSION_ROOT, `${session.id}.json`);
  fs.mkdirSync(path.join(root, 'save', 'logs'), { recursive: true });
  transactionalWriteSet(fs, [[modulePath, runtimeLua(session)+(session.pausedInspector?'\n'+require('./paused_match_bridge').runtime(session.pausedInspector):'')], [recordPath, `${JSON.stringify(session, null, 2)}\n`]], { label: 'prepare-ikemaker-test-session', journalRoot: root, backup: false, journal: false, allowExisting: true });
  return { modulePath, recordPath, resultPath: path.join(root, 'save', 'logs', `IKEMaker-${String(session.id).replace(/[^a-z0-9_-]/gi, '_')}.json`) };
}
function resultFiles(root) {
  const directory = path.join(root, 'save', 'logs');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^IKEMaker-.*\.json$/i.test(name)).map(name => path.join(directory, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}
function removeBootstrap(root) {
  const filename = path.join(root, ...MODULE_RELATIVE.split('/'));
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
}

module.exports = { MODULE_RELATIVE, SESSION_ROOT, luaString, runtimeLua, moveRuntimeLua, installSession, resultFiles, removeBootstrap };
