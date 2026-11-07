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

local phase='telemetry';local owned=false;local pauseEngaged=false;local startTick=nil;local held=0;local lastSequence=1;local lastSampleSequence=0;local pending=nil
local tracked={};local events={};local eventDrops=0;local lastTrackedTick=nil
local nextProjectileRuntimeId=1000000000;local currentProjectiles={}
local sampleCosts={};local sampleCostDrops=0
local sampleSendAttempts=0;local sampleSendFailures=0
local costFirstTick=nil;local costLastTick=nil;local repeatedHooks=0
local function frame(payload)local n=#payload;return string.char(n%256,math.floor(n/256)%256,math.floor(n/65536)%256,math.floor(n/16777216)%256)..payload end
local function send(path,payload)
 if #payload>4096 then return false end
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
 if value.opcode~='pause' and value.opcode~='step' and value.opcode~='resume' and value.opcode~='disconnect' then return nil end
 return {sequence=seq,opcode=value.opcode,command=value.command,ack=value.ack}
end
local function ack(offer,status,t,extra)
 local payload='epoch=1\tseq='..offer.sequence..'\top='..offer.opcode..'\tstatus='..status..'\ttick='..t
 if extra~=nil and extra~='' then payload=payload..extra end
 if send(offer.ack,payload) then lastSequence=offer.sequence;pending=nil;return true end
 return false
end
local function sampleEntity(kind,owner,items)
 local ok,value=pcall(function()local runtimeId=id();return table.concat({kind,owner,runtimeId,runtimeId,stateNo(),anim(),posX(),posY(),velX(),velY()},',')end)
 if ok then items[#items+1]=value end;return ok
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
 if projCount>16 then complete=false end
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
 local seen={};local complete=true;currentProjectiles={}
 for key,record in pairs(tracked) do
  local kind,owner,runtimeId=key:match('^([^:]+):(%d+):(%d+)$')
  if kind=='projectile' then emitEvent('last',kind,owner,runtimeId,t,record.tick,record.watch,record.sourceRuntimeId);tracked[key]=nil end
 end
 for owner=1,2 do
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
local function trySample(t)
 local value=readConfig();if value==nil or value.session~=cfg.session or value.epoch~='1' then return end
 local seq=tonumber(value.sampleSequence);if seq==nil or seq%1~=0 or seq<=lastSampleSequence or not pipe(value.sample) then return end
 local items={};local complete=true
 for owner=1,2 do
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
  return table.concat(fields,'\t')
 end
 for _,item in ipairs(events) do chosenEvents[#chosenEvents+1]=item;if #compose()>4096 then chosenEvents[#chosenEvents]=nil;drops=drops+1;truncatedEvents=truncatedEvents+1 end end
 for index,item in ipairs(items) do chosenItems[#chosenItems+1]=item;if #compose()>4096 then chosenItems[#chosenItems]=nil;complete=false;truncatedEntities=#items-index+1;break end end
 sampleSendAttempts=sampleSendAttempts+1
 local payload=compose()
 while #payload>4096 do
  if #chosenItems>0 then chosenItems[#chosenItems]=nil;truncatedEntities=truncatedEntities+1;complete=false
  elseif #chosenEvents>0 then chosenEvents[#chosenEvents]=nil;drops=drops+1;truncatedEvents=truncatedEvents+1
  else return end
  payload=compose()
 end
 if send(value.sample,payload) then lastSampleSequence=seq;events={};eventDrops=0;sampleCosts={};sampleCostDrops=0;sampleSendAttempts=0;sampleSendFailures=0;costFirstTick=nil;costLastTick=nil;repeatedHooks=0 else sampleSendFailures=sampleSendFailures+1 end
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
 local sampleStarted=os.clock();local advanced=trackEntities(t);trySample(t);if advanced then recordSampleCost(sampleStarted,t) else repeatedHooks=repeatedHooks+1 end
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
 end
end)
