-- Removable IKeMeter bridge. Inactive without an explicit protected session file.
local configPath=os.getenv('IKEMETER_SESSION_FILE');if configPath==nil or configPath=='' then return end
local function readConfig()
 local file=io.open(configPath,'rb');if file==nil then return nil end
 local value={};for line in file:lines() do local k,v=line:match('^([%a]+)=([^%c]+)$');if k and v then value[k]=v end end;file:close();return value
end
local function pipe(value)return value~=nil and value:match('^\\\\%.\\pipe\\ikemeter%-[%w_%-]+$')~=nil end
local function startup(status)local s=io.open(configPath..'.status','wb');if s~=nil then s:write(status);s:close() end end
local cfg=readConfig();if cfg==nil or cfg.protocol~='1' or cfg.session==nil or cfg.epoch~='1' or not pipe(cfg.telemetry) then startup('invalid-session');return end
startup('loaded')
local rootCount=cfg.rootSlots=='4' and 4 or 2

local phase='telemetry';local owned=false;local pauseEngaged=false;local startTick=nil;local held=0;local lastSequence=1;local lastSampleSequence=0;local pending=nil
local tracked={};local events={};local eventDrops=0;local lastTrackedTick=nil
local nextProjectileRuntimeId=1000000000;local currentProjectiles={};local currentProjectilesTruncated=false
local sampleCosts={};local sampleCostDrops=0
local sampleSendAttempts=0;local sampleSendFailures=0
local costFirstTick=nil;local costLastTick=nil;local repeatedHooks=0
local maxPayload=4096
local function frame(payload)local n=#payload;return string.char(n%256,math.floor(n/256)%256,math.floor(n/65536)%256,math.floor(n/16777216)%256)..payload end
local function send(path,payload)
 if #payload>maxPayload then return false end
 local p=io.open(path,'wb');if p==nil then return false end
 local wrote=p:write(frame(payload));local flushed=nil;if wrote~=nil then flushed=p:flush() end;local closed=p:close()
 return wrote~=nil and flushed~=nil and closed~=nil
end
-- Pinned gameTime() returns signed int32; invalid observations never authorize a hook.
local function validTick(value)return type(value)=='number' and value>=0 and value<=2147483647 and value%1==0 end
local terminal=nil
local function revoke(reason,t)
 if terminal==nil then local observed=validTick(t) and t or nil;terminal={reason=reason,lastTick=lastTrackedTick or startTick or 0,observedTick=observed} end
 owned=false;pauseEngaged=false;pending=nil;phase='rejected'
end
local function reportTerminal()
 local value=readConfig();if value==nil or value.session~=cfg.session or value.epoch~='1' then return end
 local seq=tonumber(value.sampleSequence);if seq==nil or seq%1~=0 or seq<=lastSampleSequence or not pipe(value.sample) then return end
 local payload='protocol=1\tkind=terminal\tsession='..cfg.session..'\tepoch=1\tsequence='..seq..'\treason='..terminal.reason..'\tlastTick='..terminal.lastTick
 if terminal.observedTick~=nil then payload=payload..'\tobservedTick='..terminal.observedTick end
 if send(value.sample,payload) then lastSampleSequence=seq;phase='terminalSent' end
end
local function consume(path)local p=io.open(path,'wb');if p==nil then return false end;p:close();return true end
local function eligible()
 local om,m=pcall(gameMode);local on,n=pcall(netPlay);local ot,t=pcall(gameTime);local op,p=pcall(paused);local orunning,running=pcall(gameRunning);local oloading,isLoading=pcall(loading)
 if not om or m~='quickvs' or not on or n~=false or not ot or not validTick(t) or not op or type(p)~='boolean' or not orunning or running~=true or not oloading or isLoading~=false then return false,t,p end
 return true,t,p
end
local function readOffer()
 local value=readConfig();if value==nil or value.session~=cfg.session or value.epoch~='1' then return nil end
 local seq=tonumber(value.sequence);if seq==nil or seq%1~=0 or seq<=lastSequence or not pipe(value.command) or not pipe(value.ack) then return nil end
 if value.opcode~='pause' and value.opcode~='step' and value.opcode~='resume' and value.opcode~='snapshot' and value.opcode~='disconnect' then return nil end
 return {sequence=seq,opcode=value.opcode,command=value.command,ack=value.ack}
end
local function ack(offer,status,t,extra)
 local payload='epoch=1\tseq='..offer.sequence..'\top='..offer.opcode..'\tstatus='..status..'\ttick='..t
 if type(extra)=='function' then extra=extra(maxPayload-#payload) end
 if extra~=nil and extra~='' then payload=payload..extra end
 if send(offer.ack,payload) then lastSequence=offer.sequence;pending=nil;return true end
 return false
end
local function sampleEntity(kind,owner,items)
 local ok,value=pcall(function()local runtimeId=id();return table.concat({kind,owner,runtimeId,runtimeId,stateNo(),anim(),posX(),posY(),velX(),velY()},',')end)
 if ok then items[#items+1]=value end;return ok
end
local function signedInt32(value)
 return type(value)=='number' and value>=-2147483648 and value<=2147483647 and value%1==0
end
local function airFrameRead(field)
 local ok,value=pcall(animElemVar,field)
 if ok and signedInt32(value) then return value end
end
local function airTimingEstimate(duration)
 local ok,element,elapsed=pcall(function()
  -- The pinned Lua triggers compensate for the post-frame step. This remains an estimate.
  if isAsserted('animfreeze')~=false or hitPauseTime()~=0 or pauseTime()~=0 then return end
  if duration~=-1 and (not validTick(duration) or duration==0) then return end
  local current=animElemNo(0)
  if not validTick(current) or current==0 then return end
  local time=animElemTime(current)
  if validTick(time) and (duration==-1 or time<duration) then return current,time end
 end)
 if ok then return element,elapsed end
end
local function spriteIndex(value)
 return validTick(value) and value<=65535
end
local function resolvedSprite()
 local ok,group,image=pcall(function()
  local width=spriteVar('width')
  if not spriteIndex(width) or width==0 then return end
  local group,image=spriteVar('group'),spriteVar('image')
  if spriteIndex(group) and spriteIndex(image) then return group,image end
 end)
 if ok then return group,image end
end
local function snapshotAnimationFields()
 local group,image,duration=airFrameRead('group'),airFrameRead('image'),airFrameRead('time')
 if group==nil or image==nil then group,image=nil,nil end
 local element,elapsed=airTimingEstimate(duration)
 local spriteGroup,spriteImage=resolvedSprite()
 if element==nil and group==nil and duration==nil and spriteGroup==nil then return end
 return ','..table.concat({element or '-',elapsed or '-',group or '-',image or '-',duration or '-',spriteGroup or '-',spriteImage or '-'},',')
end
local function ownerSlot(trigger)
 local ok,value=pcall(trigger)
 -- Pinned MaxPlayerNo = four Simul slots per side plus four attached slots.
 if ok and validTick(value) and value<=12 then return tostring(value) end
 return ''
end
local function snapshotRootSelection(owner)
 local ok,slot,runtimeId,ref,definition,details=pcall(function()
  local selected=getSelectNo()
  return playerNo(),id(),selected,getCharFileName(selected),getCharInfo(selected).def
 end)
 if not ok or slot~=owner or not validTick(runtimeId) or not validTick(ref) or
    type(definition)~='string' or #definition>160 or definition~=details or
    not definition:match('^[a-zA-Z0-9_./%-]+$') then return end
 local hex=definition:gsub('.',function(byte)return string.format('%02x',string.byte(byte))end)
 return '\tbind'..owner..'='..slot..','..runtimeId..','..ref..','..hex
end
local function snapshotExtra(budget)
 local parts={'\tpaused=1','\tcoverage=bounded-observed-roots-helpers-projectiles'};local ox,cx=pcall(cameraPosX);local oy,cy=pcall(cameraPosY);local oz,cz=pcall(cameraZoom)
 if ox and oy and oz and type(cx)=='number' and type(cy)=='number' and type(cz)=='number' then parts[#parts+1]='\tcameraCoverage=observed';parts[#parts+1]='\tcameraX='..cx;parts[#parts+1]='\tcameraY='..cy;parts[#parts+1]='\tcameraZoom='..cz else parts[#parts+1]='\tcameraCoverage=unavailable' end
 if cfg.binding=='1' then
  for owner=1,2 do
   if player(owner) then
    local selection=snapshotRootSelection(owner)
    if selection~=nil then parts[#parts+1]=selection end
   end
  end
 end
 local coverage={rows={},owners={},truncated=currentProjectilesTruncated,
  remaining=budget-#table.concat(parts)-#'\tentityCaptured=32\tentityTruncated=1\townerSlotsOmitted=32'}
 if cfg.richTelemetry=='1' then
  coverage.remaining=coverage.remaining-rootCount*#'\tcustom4=2147483647,1'
 end
 local function append(values,animation,owners)
  local index=#coverage.rows+1
  if index>32 then coverage.truncated=true;return end
  local row='\tsnap'..index..'='..values
  if #row>coverage.remaining then coverage.truncated=true;return end
  if animation~=nil and #row+#animation<=coverage.remaining then
   row=row..animation
  elseif owners~=nil then
   owners=',-,-,-,-,-,-,-'..owners
  end
  coverage.owners[index]=owners
  coverage.remaining=coverage.remaining-#row;coverage.rows[index]=row
  return true
 end
 local function add(kind,owner)
  local ok,values,runtimeId=pcall(function()
   local runtimeId=id()
   return table.concat({kind,owner,runtimeId,runtimeId,stateNo(),anim(),posX(),posY(),velX(),velY()},','),runtimeId
  end)
  if ok then
   local animation=snapshotAnimationFields()
   local animationOwner,spriteOwner=ownerSlot(animPlayerNo),ownerSlot(spritePlayerNo)
   local owners
   if animationOwner~='' or spriteOwner~='' then
    owners=','..animationOwner..','..spriteOwner
    if cfg.binding=='1' then
     local prefixOk,prefix=pcall(animPrefix)
     if prefixOk and type(prefix)=='string' and #prefix<=16 and prefix:match('^[a-zA-Z0-9]+$') then owners=owners..','..prefix end
    end
   end
   if append(values,animation,owners) and kind==1 and cfg.richTelemetry=='1' then
    local read,slot,selected,custom=pcall(function()return playerNo(),id(),inCustomState() end)
    if read and slot==owner and selected==runtimeId and validTick(runtimeId) and type(custom)=='boolean' then
     parts[#parts+1]='\tcustom'..owner..'='..runtimeId..','..(custom and '1' or '0')
    end
   end
  else coverage.truncated=true end
 end
 for owner=1,rootCount do if player(owner) then add(1,owner) else coverage.truncated=true end end
 for owner=1,rootCount do
  if player(owner) then
   local ok,count=pcall(numHelper)
   if ok and validTick(count) then
    if count>24 then coverage.truncated=true end
    for offset=1,math.min(count,24) do
     if player(owner) and helperIndex(offset) then add(2,owner) else coverage.truncated=true end
    end
   else coverage.truncated=true end
  end
 end
 for _,projectile in ipairs(currentProjectiles) do
  local w=projectile.watch
  append(table.concat({3,projectile.owner,projectile.runtimeId,projectile.sourceRuntimeId,w[1],w[2],w[3],w[4],w[5],w[6]},','))
 end
 -- Retain the existing entity and animation coverage before spending spare bytes on owner slots.
 local ownerSlotsOmitted=0
 for index,row in ipairs(coverage.rows) do
  local owners=coverage.owners[index]
  if owners~=nil and #owners<=coverage.remaining then
   coverage.rows[index]=row..owners
   coverage.remaining=coverage.remaining-#owners
  elseif owners~=nil then
   ownerSlotsOmitted=ownerSlotsOmitted+1
  end
 end
 parts[#parts+1]=table.concat(coverage.rows)
 parts[#parts+1]='\tentityCaptured='..#coverage.rows
 parts[#parts+1]='\tentityTruncated='..(coverage.truncated and '1' or '0')
 parts[#parts+1]='\townerSlotsOmitted='..ownerSlotsOmitted
 return table.concat(parts)
end
local function watchValues()
 local ok,value=pcall(function()return {stateNo(),anim(),posX(),posY(),velX(),velY()}end);if ok then return value end;return nil
end
local function emitEvent(action,kind,owner,runtimeId,tick,sampleTick,watch,sourceRuntimeId)
 if watch==nil then action='gap';kind='scan';owner=0;runtimeId=0;sourceRuntimeId=0;sampleTick=tick;watch={0,0,0,0,0,0} end
 if #events<32 then events[#events+1]=table.concat({action,kind,owner,runtimeId,sourceRuntimeId or runtimeId,tick,sampleTick,watch[1],watch[2],watch[3],watch[4],watch[5],watch[6]},',') else eventDrops=eventDrops+1 end
end
local function observeProjectiles(owner,sourceRuntimeId,t,seen)
 local complete=true;local projOk,projCount=pcall(numProj);if not projOk or type(projCount)~='number' or projCount<0 then return false end
 if projCount>16 then complete=false;currentProjectilesTruncated=true end
 for index=0,math.min(projCount,16)-1 do
  local ok,authoredId,animValue,x,y,vx,vy=pcall(function()return projVar(-1,index,'projid'),projVar(-1,index,'anim'),projVar(-1,index,'pos x'),projVar(-1,index,'pos y'),projVar(-1,index,'vel x'),projVar(-1,index,'vel y')end)
  if ok then
   local runtimeId=nextProjectileRuntimeId;nextProjectileRuntimeId=nextProjectileRuntimeId+1
   local watch={authoredId,animValue,x,y,vx,vy};local key='projectile:'..owner..':'..runtimeId;seen[key]=true
   emitEvent('first','projectile',owner,runtimeId,t,t,watch,sourceRuntimeId);tracked[key]={tick=t,watch=watch,sourceRuntimeId=sourceRuntimeId};currentProjectiles[#currentProjectiles+1]={owner=owner,runtimeId=runtimeId,sourceRuntimeId=sourceRuntimeId,authoredId=authoredId,watch=watch}
  else complete=false end
 end
 return complete
end
local function trackEntities(t)
 if lastTrackedTick==t then return false end;lastTrackedTick=t
 local seen={};local complete=true;currentProjectiles={};currentProjectilesTruncated=false
 for key,record in pairs(tracked) do
  local kind,owner,runtimeId=key:match('^([^:]+):(%d+):(%d+)$')
  if kind=='projectile' then emitEvent('last',kind,owner,runtimeId,t,record.tick,record.watch,record.sourceRuntimeId);tracked[key]=nil end
 end
 for owner=1,rootCount do
  if player(owner) then
   local rootId=id();local rootKey='player:'..owner..':'..rootId;local rootWatch=watchValues();seen[rootKey]=true
   if tracked[rootKey]==nil then emitEvent('first','player',owner,rootId,t,t,rootWatch) end;tracked[rootKey]={tick=t,watch=rootWatch}
   if not observeProjectiles(owner,rootId,t,seen) then complete=false end
   local countOk,count=pcall(numHelper);if not countOk or type(count)~='number' or count<0 then complete=false;count=0 end
   if count>24 then complete=false end
   for offset=1,math.min(count,24) do
    if player(owner) and helperIndex(offset) then local runtimeId=id();local key='helper:'..owner..':'..runtimeId;local watch=watchValues();seen[key]=true;if tracked[key]==nil then emitEvent('first','helper',owner,runtimeId,t,t,watch) end;tracked[key]={tick=t,watch=watch};if not observeProjectiles(owner,runtimeId,t,seen) then complete=false end else complete=false end
   end
   if not player(owner) then complete=false end
  else complete=false end
 end
 if complete then for key,record in pairs(tracked) do if not seen[key] then local kind,owner,runtimeId=key:match('^([^:]+):(%d+):(%d+)$');emitEvent(kind=='projectile' and 'last' or 'gone',kind,owner,runtimeId,t,record.tick,record.watch,record.sourceRuntimeId);tracked[key]=nil end end
 else emitEvent('gap','scan',0,0,t,t,nil) end
 return true
end
local function finite(value)return type(value)=='number' and value==value and math.abs(value)<math.huge end
local function boolean(value)return type(value)=='boolean' end
local function choice(value,choices)return type(value)=='string' and #value==1 and choices:find(value,1,true)~=nil end
local function movement(value)return choice(value,'IAH') end
local function stateKind(value)return choice(value,'SCALN') end
local function direction(value)return value==1 or value==-1 end
local function ownerNumber(value)return validTick(value) and value<=12 end
local function readField(getter,validate,parameter)
 local ok,value
 if parameter==nil then ok,value=pcall(_G[getter]) else ok,value=pcall(_G[getter],parameter) end
 if ok and validate(value) then return tostring(value) end
 return '-f'
end
local function telemetryRows(t,p)
 local rows={}
 local started,before,wasPaused=pcall(function()return gameTime(),paused() end)
 if not started or before~=t or wasPaused~=p then return '\trootObservation=unavailable' end
 local observedIds={}
 for slot=1,rootCount do
  local ok,selected=pcall(player,slot)
  if not ok or selected~=true then
   rows[slot]=ok and '-i' or '-r'
  else
   local idOk,rootId,expectedSlot=pcall(function()return id(),playerNo() end)
   if not idOk or not validTick(rootId) or expectedSlot~=slot or observedIds[rootId] then
    rows[slot]='-r'
   else
    observedIds[rootId]=true
    local widthOk,width=pcall(spriteVar,'width')
    local group,image='-a','-a'
    if not widthOk then group,image='-f','-f'
    elseif spriteIndex(width) and width>0 then group=readField('spriteVar',spriteIndex,'group');image=readField('spriteVar',spriteIndex,'image') end
    rows[slot]=table.concat({
     rootId,readField('teamSide',function(value)return value==1 or value==2 end),
     readField('posX',finite),readField('posY',finite),readField('posZ',finite),
     readField('velX',finite),readField('velY',finite),readField('velZ',finite),
     readField('const',finite,'movement.yaccel'),'-u',
     readField('stateNo',signedInt32),readField('prevStateNo',signedInt32),readField('anim',signedInt32),
     readField('ctrl',boolean),readField('moveType',movement),readField('stateType',stateKind),readField('physics',stateKind),
     readField('time',signedInt32),readField('hitPauseTime',signedInt32),readField('pauseTime',signedInt32),
     readField('facing',direction),readField('cameraPosX',finite),readField('localCoordX',finite),readField('localCoordY',finite),
     readField('getStateOwnerPlayerNo',ownerNumber),readField('animPlayerNo',ownerNumber),readField('spritePlayerNo',ownerNumber),
     '-d',group,image,'-d','-d',readField('palNo',signedInt32)
    },',')
   end
  end
 end
 local stopped,after,isPaused=pcall(function()return gameTime(),paused() end)
 if not stopped or after~=t or isPaused~=p then return '\trootObservation=unavailable' end
 local fields={'\trootObservation='..(p and 'paused' or 'running')}
 for slot,row in ipairs(rows) do fields[#fields+1]='\troot'..slot..'='..row end
 return table.concat(fields)
end
local watchPlan={}
local watchGetter={var=var,fvar=fvar,sysvar=sysVar,sysfvar=sysFvar,map=map}
if cfg.richTelemetry=='1' and cfg.watchPlan~=nil then
 for spec in cfg.watchPlan:gmatch('[^,]+') do
  local slot,kind,key,mapIndex,ownerHelperId=spec:match('^([1-4]):([a-z]+):([%w_.%-]+):([_%d%-]+):([_%d]+)$')
  if slot~=nil and #watchPlan<12 then
   watchPlan[#watchPlan+1]={slot=tonumber(slot),kind=kind,key=kind=='map' and key or tonumber(key),mapIndex=tonumber(mapIndex),
    ownerHelperId=tonumber(ownerHelperId)}
  end
 end
end
local function watchHelpers(slot,owner,authored,contexts)
 local total=numHelper()
 if not validTick(total) or total>8 then return end
 local rows={};local ids={}
 for ordinal=1,total do
  if not player(slot) or id()~=owner or not helperIndexExist(ordinal) or not helperIndex(ordinal) or not isHelper() then return end
  local entity,helperId=id(),helperVar('id')
  if not validTick(entity) or ids[entity] or not validTick(helperId) then return end
  ids[entity]=true
  if authored==nil or authored==helperId then
   if not playerId(entity) or id()~=entity or not parent() then return end
   local parentId=id()
   if not validTick(parentId) or not playerId(entity) or id()~=entity or not root() or id()~=owner then return end
   rows[#rows+1]={entity,helperId,parentId,ordinal-1}
   if not playerId(entity) or id()~=entity or not isHelper() then return end
   local state=readField('stateNo',signedInt32)
   if state~='-f' then
    contexts[entity]=state..':'..readField('getStateOwnerPlayerNo',function(value)return ownerNumber(value) and value>=1 end)
   end
  end
 end
 if player(slot) and id()==owner and not helperIndexExist(total+1) then return rows end
end
local function watchEffectCount(spec)
 if spec.kind=='explod' then return spec.key~=nil and numExplod(spec.key) or numExplod() end
 return spec.key~=nil and numProjId(spec.key) or numProj()
end
local function watchOwnedEffects(spec,owner,contexts)
 local helpers=watchHelpers(spec.slot,owner,spec.ownerHelperId,contexts)
 if helpers==nil then return end
 local rows={'owned'}
 for _,helper in ipairs(helpers) do
  if not playerId(helper[1]) or id()~=helper[1] or not isHelper() then return end
  local count=watchEffectCount(spec)
  if not validTick(count) then return end
  rows[#rows+1]=table.concat({helper[1],helper[3],count},':')
 end
 return table.concat(rows,',')
end
local function watchObservation(spec,t,p)
 if gameTime()~=t or paused()~=p or not player(spec.slot) or playerNo()~=spec.slot then return end
 local owner=id();if not validTick(owner) then return end
 local contexts={}
 if spec.ownerHelperId~=nil then
  local rows=watchOwnedEffects(spec,owner,contexts)
  if gameTime()~=t or paused()~=p then return end
  return owner..','..(rows or '-'),rows and contexts
 end
 local getter=watchGetter[spec.kind]
 local value,details
 if getter~=nil then
  if spec.mapIndex~=nil then value=getter(spec.key,spec.mapIndex) else value=getter(spec.key) end
 elseif spec.kind=='helper' then
  value=spec.key~=nil and numHelper(spec.key) or numHelper()
  local helpers=validTick(value) and watchHelpers(spec.slot,owner,spec.key,contexts)
  if helpers and #helpers==value then
   local rows={'full'}
   for _,helper in ipairs(helpers) do rows[#rows+1]=table.concat(helper,':') end
   details=','..table.concat(rows,',')
  end
 elseif spec.kind=='explod' or spec.kind=='projectile' then
  value=watchEffectCount(spec)
 end
 if gameTime()~=t or paused()~=p then return end
 if type(value)=='string' and #value<=48 and spec.kind=='map' then
  value='s'..value:gsub('.',function(byte)return string.format('%02x',string.byte(byte))end)
 elseif finite(value) then
  value=tostring(value)
 else value='-' end
 return owner..','..value..(details or ''),details and contexts
end
local function trySample(t,p)
 local value=readConfig();if value==nil or value.session~=cfg.session or value.epoch~='1' then return end
 local seq=tonumber(value.sampleSequence);if seq==nil or seq%1~=0 or seq<=lastSampleSequence or not pipe(value.sample) then return end
 local rootExtras=cfg.richTelemetry=='1' and telemetryRows(t,p) or ''
 local items={};local complete=true
 for owner=1,rootCount do
  if player(owner) then
   if not sampleEntity('player',owner,items) then complete=false end
   local countOk,count=pcall(numHelper);if not countOk or type(count)~='number' or count<0 then complete=false;count=0 end
   if count>24 then complete=false end
   for offset=1,math.min(count,24) do
    if player(owner) and helperIndex(offset) then if not sampleEntity('helper',owner,items) then complete=false end else complete=false end
   end
  else complete=false end
 end
 for _,projectile in ipairs(currentProjectiles) do local watch=projectile.watch;items[#items+1]=table.concat({'projectile',projectile.owner,projectile.runtimeId,projectile.sourceRuntimeId,watch[1],watch[2],watch[3],watch[4],watch[5],watch[6]},',') end
 local chosenEvents={};local chosenItems={};local drops=eventDrops;local truncatedEvents=0;local truncatedEntities=0
 local sortedCosts={};local costSum=0;local costMax=0
 local thresholds={10,25,50,100,250,500,1000,2000,5000};local histogram={0,0,0,0,0,0,0,0,0,0}
 for i,value in ipairs(sampleCosts) do sortedCosts[i]=value;costSum=costSum+value;if value>costMax then costMax=value end;local bucket=10;for j,limit in ipairs(thresholds) do if value<=limit then bucket=j;break end end;histogram[bucket]=histogram[bucket]+1 end;table.sort(sortedCosts)
 local costP95=#sortedCosts>0 and sortedCosts[math.max(1,math.ceil(#sortedCosts*0.95))] or 0
 local function compose()
  local fields={'epoch=1','tick='..t,'complete='..(complete and '1' or '0'),'count='..#chosenItems,'eventCount='..#chosenEvents,'eventDrops='..drops,'costCount='..#sampleCosts,'costSumUs='..math.floor(costSum+0.5),'costMaxUs='..math.floor(costMax+0.5),'costP95Us='..math.floor(costP95+0.5),'costDrops='..sampleCostDrops,'costHistogram='..table.concat(histogram,','),'costFirstTick='..(costFirstTick or -1),'costLastTick='..(costLastTick or -1),'deliveredThroughTick='..t,'repeatedHooks='..repeatedHooks,'sendAttempts='..sampleSendAttempts,'sendFailures='..sampleSendFailures,'truncatedEvents='..truncatedEvents,'truncatedEntities='..truncatedEntities}
  for i,item in ipairs(chosenItems) do fields[#fields+1]='entity'..i..'='..item end
  for i,item in ipairs(chosenEvents) do fields[#fields+1]='event'..i..'='..item end
  return table.concat(fields,'\t')..rootExtras
 end
 -- Reserve actual watch bytes while protecting root/control telemetry.
 -- Extra headroom covers length changes to the counters below.
 local watchExtras=''
 if #watchPlan>0 then
  local watchBudget=math.max(0,math.min(768,maxPayload-#compose()-64))
  local first=(seq-2)%#watchPlan
  local stateFields={}
  for offset=0,#watchPlan-1 do
   local index=(first+offset)%#watchPlan+1
   local ok,row,contexts=pcall(watchObservation,watchPlan[index],t,p)
   if ok and row~=nil then
    local field='\twatch'..index..'='..row
    if #watchExtras+#field<=watchBudget then
     watchExtras=watchExtras..field
     if contexts~=nil then
      local ids={}
      for entity in pairs(contexts) do ids[#ids+1]=entity end
      table.sort(ids)
      for _,entity in ipairs(ids) do
       stateFields[#stateFields+1]='\twatchState'..index..'='..entity..':'..contexts[entity]
      end
     end
    end
   end
  end
  -- Fit optional state context only after the core watch rows have their budget.
  for _,field in ipairs(stateFields) do
   if #watchExtras+#field<=watchBudget then watchExtras=watchExtras..field end
  end
 end
 local sampleBudget=maxPayload-#watchExtras
 for _,item in ipairs(events) do chosenEvents[#chosenEvents+1]=item;if #compose()>sampleBudget then chosenEvents[#chosenEvents]=nil;drops=drops+1;truncatedEvents=truncatedEvents+1 end end
 for index,item in ipairs(items) do chosenItems[#chosenItems+1]=item;if #compose()>sampleBudget then chosenItems[#chosenItems]=nil;complete=false;truncatedEntities=#items-index+1;break end end
 sampleSendAttempts=sampleSendAttempts+1
 local payload=compose()
 while #payload>sampleBudget do
  if #chosenItems>0 then chosenItems[#chosenItems]=nil;truncatedEntities=truncatedEntities+1;complete=false
  elseif #chosenEvents>0 then chosenEvents[#chosenEvents]=nil;drops=drops+1;truncatedEvents=truncatedEvents+1
  else return end
  payload=compose()
 end
 if send(value.sample,payload..watchExtras) then lastSampleSequence=seq;events={};eventDrops=0;sampleCosts={};sampleCostDrops=0;sampleSendAttempts=0;sampleSendFailures=0;costFirstTick=nil;costLastTick=nil;repeatedHooks=0 else sampleSendFailures=sampleSendFailures+1 end
end
local function recordSampleCost(started,t)
 local elapsed=(os.clock()-started)*1000000
 if costFirstTick==nil then costFirstTick=t end;costLastTick=t
 if #sampleCosts<256 then sampleCosts[#sampleCosts+1]=elapsed else sampleCostDrops=sampleCostDrops+1 end
end

hook.add('loop','ikemeter-attached-bridge',function()
 if phase=='complete' or phase=='terminalSent' then return end
 if phase=='rejected' then reportTerminal();return end
 local ok,t,p=eligible()
 if not ok then revoke('eligibility-lost',t);reportTerminal();return end
 if lastTrackedTick~=nil and t<lastTrackedTick then revoke('clock-rewind',t);reportTerminal();return end
 local sampleStarted=os.clock();local advanced=trackEntities(t)
 -- Leave the offered credit outstanding until the same tick is observed under the re-engaged pause.
 if cfg.richTelemetry~='1' or phase~='stepDelta' or not owned or p or t~=startTick+1 then trySample(t,p) end
 if advanced then recordSampleCost(sampleStarted,t) else repeatedHooks=repeatedHooks+1 end
 if owned and (phase=='paused' or phase=='pauseAck' or phase=='stepHold') and not p then revoke('pause-ownership-lost',t);reportTerminal();return end

 local emergency=readOffer()
 if emergency~=nil and emergency.opcode=='disconnect' and consume(emergency.command) then pending=emergency;if pauseEngaged and p then togglePause() end;pauseEngaged=false;owned=false;phase='disconnectAck';return end

 if phase=='telemetry' then
  if send(cfg.telemetry,'session='..cfg.session..'\tepoch=1\ttick='..t..'\tmode=quickvs') then startup('telemetry-sent');phase='running' end
  return
 end

 if phase=='pauseAck' then if p and owned and t==startTick and ack(pending,'applied',t,'') then pauseEngaged=true;phase='paused' end;return end
 if phase=='stepDelta' then
  local d=t-startTick
  if d==1 and not p and owned then togglePause();pauseEngaged=true;held=0;phase='stepHold'
  elseif d<0 or d>1 then revoke('step-discontinuity',t);reportTerminal() end
  return
 end
 if phase=='stepHold' then
  if not p or t~=startTick+1 then revoke('step-discontinuity',t);reportTerminal();return end
  held=held+1;if held>=3 and ack(pending,'applied',t,'\tfrom='..startTick..'\theld='..held) then phase='paused' end;return
 end
 if phase=='resumeAck' then if not p and ack(pending,'applied',t,'') then pauseEngaged=false;owned=false;phase='running' end;return end
 if phase=='disconnectAck' then
  if (not owned or not p) and ack(pending,'applied',t,'') then owned=false;phase='complete' end;return
 end

 local offer=readOffer();if offer==nil or not consume(offer.command) then return end
 pending=offer
 if offer.opcode=='disconnect' then if pauseEngaged and p then togglePause() end;pauseEngaged=false;owned=false;phase='disconnectAck';return end
 if offer.opcode=='pause' then
  if phase~='running' then ack(offer,'unavailable',t,'\treason=invalid-phase')
  elseif p then ack(offer,'rejected',t,'\treason=preexisting-pause');revoke('pause-ownership-lost',t);reportTerminal()
  else togglePause();owned=true;pauseEngaged=true;startTick=t;phase='pauseAck' end
 elseif offer.opcode=='step' then
  if phase~='paused' or not p or not owned then ack(offer,'unavailable',t,'\treason=not-owned-paused')
  else togglePause();pauseEngaged=false;startTick=t;held=0;phase='stepDelta' end
 elseif offer.opcode=='resume' then
  if phase~='paused' or not p or not owned then ack(offer,'unavailable',t,'\treason=not-owned-paused')
  else togglePause();pauseEngaged=false;phase='resumeAck' end
 elseif offer.opcode=='snapshot' then
  if phase~='paused' or not p or not owned then ack(offer,'unavailable',t,'\treason=not-owned-paused')
  else local captured=pcall(screenshot);if captured then ack(offer,'applied',t,snapshotExtra) else ack(offer,'unavailable',t,'\treason=screenshot-failed') end end
 end
end)
