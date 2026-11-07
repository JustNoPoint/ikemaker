-- Generated disposable Stage Live pilot only. Never installed in a project runtime.
local session=__SESSION__;local sourceHash=__SOURCE_HASH__;local commandPath=__COMMAND__;local ackPath=__ACK__;local stagePath=__STAGE_PATH__;local expectedStage=__STAGE_TEXT__;local targetId=__TARGET_ID__;local targetIndex=__TARGET_INDEX__;local expectedCount=__COUNT__
local phase='waiting';local lastOffer=-1;local lastTick=nil;local lastStageTick=nil;local boundRound=nil;local boundPlayer=nil;local pending=nil;local idle=0;local boundaries=0
local function valid(n)return type(n)=='number' and n==n and n>=0 and n<=2147483647 and n%1==0 end
local function readFile(path,limit)local f=io.open(path,'rb');if not f then return nil end;local v=f:read(limit+1);f:close();if not v or #v>limit then return nil end;return v end
local function rows()local result={};for i=0,expectedCount-1 do result[#result+1]=table.concat({stageBgVar(-1,i,'id'),stageBgVar(-1,i,'start.x'),stageBgVar(-1,i,'delta.x'),stageBgVar(-1,i,'start.y'),stageBgVar(-1,i,'delta.y'),stageBgVar(-1,i,'layerno')},',')end;return table.concat(result,';')end
local function send(seq,status,reason)local destination=status=='terminal' and (ackPath..'.terminal') or (ackPath..'.'..seq);local f=io.open(destination,'wb');if f then f:write(table.concat({session,seq,status,gameTime(),roundNo(),numStageBg(-1),sourceHash,targetId,targetIndex,rows(),stageTime(),reason or ''},'\t')..'\n');f:close()end end
local function terminal(reason)if phase=='terminal' then return end;phase='terminal';pending=nil;if player(1) then mapSet('ikemaker_live_enabled',0)end;pcall(send,lastOffer,'terminal',reason)end
hook.add('main.f_commandLine','ikemaker-stage-live-boundary',function()boundaries=boundaries+1;if boundaries>1 then terminal('game-boundary')end end)
hook.add('loop','ikemaker-stage-live',function()
 if phase=='terminal' then return end
 local ok,err=pcall(function()
  if not gameRunning() then if phase~='waiting' then terminal('game-stopped')end;return end
  if gameMode()~='quickvs' or netPlay()~=false or loading()~=false then terminal('ineligible-mode');return end
  local t,st,r=gameTime(),stageTime(),roundNo();if not valid(t) or not valid(st) or not valid(r) or not player(1) or name()~='IKEMaker Stage Rig' then terminal('identity-unavailable');return end
  if boundPlayer and (id()~=boundPlayer or r~=boundRound or t<lastTick or st<lastStageTick) then terminal('round-or-reload');return end
  if numStageBg(-1)~=expectedCount or readFile(stagePath,1048576)~=expectedStage then terminal('stage-changed');return end
  if not boundPlayer then boundPlayer=id();boundRound=r;phase='ready' end;lastTick=t;lastStageTick=st
  idle=idle+1;if idle>300 then terminal('host-contact-lost');os.exit();return end
  if pending then
   if map('ikemaker_live_applied')==pending.seq then send(pending.seq,'applied');pending=nil end
   return
  end
  local raw=readFile(commandPath,256);if not raw then return end
  local token,seq,op,x,d=raw:match('^([^\t]+)\t(%d+)\t([a-z]+)\t([^\t]+)\t([^\t]+)$');seq=tonumber(seq);x=tonumber(x);d=tonumber(d)
  if token~=session or not seq or seq%1~=0 or seq<=lastOffer or seq>16000000 then return end
  if op~='probe' and op~='apply' or not x or not d or x~=x or d~=d or math.abs(x)>1000000 or math.abs(d)>100 then terminal('invalid-offer');return end
  lastOffer=seq;idle=0
  if op=='probe' then send(seq,'ready');return end
  if paused() then terminal('paused-command');return end
  mapSet('ikemaker_live_start',x);mapSet('ikemaker_live_delta',d);mapSet('ikemaker_live_offer',seq);mapSet('ikemaker_live_enabled',1);pending={seq=seq}
 end)
 if not ok then print('IKEMaker StageLive error: '..tostring(err));terminal('bridge-error') end
end)
