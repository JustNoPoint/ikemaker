-- One-use stock Test Session inspector. Inactive without this exact launch token.
local cfg=__CONFIG__
local pending=nil;local last=0;local ownedPause=false;local ownedTick=nil;local ownedRound=nil;local ownedSequence=nil;local heldTick=nil;local heldRound=nil;local savedFolder=nil
local function json(v)
 local t=type(v);if t=='string' then return '"'..v:gsub('[%z\1-\31\\"]',function(c)return string.format('\\u%04x',string.byte(c))end)..'"' end
 if t=='number' then if v~=v or v==math.huge or v==-math.huge then return 'null' end;return tostring(v) end
 if t=='boolean' then return v and 'true' or 'false' end;if t~='table' then return 'null' end
 local a={};if v[1]~=nil or next(v)==nil then for _,x in ipairs(v)do a[#a+1]=json(x)end;return '['..table.concat(a,',')..']'end
 for k,x in pairs(v)do a[#a+1]=json(tostring(k))..':'..json(x)end;return '{'..table.concat(a,',')..'}'
end
local function write(value)local f=io.open(cfg.reply..'.'..value.sequence,'wb');if f then f:write(json(value));f:close()end end
local function defFor(pn)if not player(pn)then return ''end;local slot=getSelectNo();if slot<0 then return ''end;return getCharFileName(slot)end
local function context()
 if netPlay() or loading() or not gameRunning() or (gameMode()~='quickvs' and gameMode()~='training')then error('Offline launched match is not active.')end
 local actors={defFor(1),defFor(2)};local info=getStageInfo(getStageNo());return actors,info.def
end
local function shot(seq)
 local actors,stage=context();local t=gameTime();if not paused()then error('Match is not held.')end
 local width=screenWidth();local height=screenHeight();local zoom=cameraZoom();local camera={x=cameraPosX(),y=cameraPosY(),zoom=zoom};local objects={};local round=roundNo();local geometryAvailable=cfg.screenPosSpace~='unverified';if geometryAvailable then local ok,value=pcall(function()return zoomVar('time')==0 and zoomVar('scale')==1 and zoomVar('pos.x')==0 and zoomVar('pos.y')==0 end);geometryAvailable=ok and value end
 local function entity(kind,pn)
  local rid=id();if posZ()~=0 or math.abs(scaleZ()-1)>0.000001 then geometryAvailable=false end;local localScale=1/const240p(1);local space=cfg.screenPosSpace=='local'and localScale or 1;local x=screenPosX()*space*zoom;local y=screenPosY()*space*zoom
  local left=x+clsnVar('size',0,'back')*localScale*facing()*zoom;local right=x+clsnVar('size',0,'front')*localScale*facing()*zoom;local top=y+clsnVar('size',0,'top')*localScale*zoom;local bottom=y+clsnVar('size',0,'bottom')*localScale*zoom
  local value={bounds={left=math.min(left,right),top=math.min(top,bottom),right=math.max(left,right),bottom=math.max(top,bottom)},boundsKind='engine-size-box',localScale=localScale,facing=facing(),kind=kind,owner=pn,identity=kind..':'..pn..':'..rid..':'..round..':'..t,runtimeId=rid,state=stateNo(),stateOwner=getStateOwnerPlayerNo(),animOwner=animPlayerNo(),action=anim(),element=animElemNo(0),x=x,y=y,priority=sprPriority(),worldX=posX(),worldY=posY(),familyId=nil}
  if kind=='helper' then local old=rid;if parent()then value.creatorId=id()end;playerId(old)end
  if #objects>=128 then return end;objects[#objects+1]=value
  local count=numProj();for i=0,math.min(count,32)-1 do
   -- Projectile positions are owner-local world coordinates; use the creator's
   -- observed screen origin to cancel camera translation, then apply zoom.
   if #objects>=128 then return end;local px=projVar(-1,i,'pos x');local py=projVar(-1,i,'pos y');local scale=1/const240p(1)
   objects[#objects+1]={kind='projectile',owner=pn,identity='projectile:'..pn..':'..rid..':'..i..':'..round..':'..t,runtimeId=i,creatorId=rid,familyId=projVar(-1,i,'projid'),state=-1,stateOwner=pn,animOwner=0,action=projVar(-1,i,'anim'),element=projVar(-1,i,'animelem'),x=x+(px-posX())*scale*zoom,y=y+(py-posY())*scale*zoom,worldX=px,worldY=py,priority=projVar(-1,i,'projsprpriority')}
  end
 end
 for pn=1,2 do if player(pn)then entity('player',pn);local count=numHelper();for offset=1,math.min(count,32)do if player(pn)and helperIndex(offset)then entity('helper',pn)end end end end
 player(1)
 return {schema=1,token=cfg.token,sequence=seq,tick=t,round=round,paused=true,ownedPause=ownedPause,actors=actors,stage=stage,width=width,height=height,geometryAvailable=geometryAvailable,keepAspect=gameOption('Video.KeepAspect'),camera=camera,objects=objects,limitations={'Actor and Helper rectangles are native engine size/body boxes, not pixel-perfect sprite silhouettes; Projectiles are origin-only.','Explods, stage layers and unobserved creation history are not inferred. Active Zoom-controller composition and Z perspective use the keyboard list only.'}}
end
hook.add('loop','IKEMaker_paused_match_'..cfg.token,function()
 local ok,err=pcall(function()
  if pending then
   if not paused()or gameTime()~=pending.tick or roundNo()~=pending.round then error('Held tick changed during screenshot.')end
   pending.frames=pending.frames+1
   if pending.frames==2 then savedFolder=gameOption('Config.ScreenshotFolder');modifyGameOption('Config.ScreenshotFolder',cfg.screens);screenshot();pending.value=shot(pending.seq)
   elseif pending.frames>=4 then modifyGameOption('Config.ScreenshotFolder',savedFolder);savedFolder=nil;heldTick=pending.tick;heldRound=pending.round;write(pending.value);pending=nil end
   return
  end
  local f=io.open(cfg.command,'rb');if not f then return end;local raw=f:read(256);f:close();local token,seq,op,scope=raw:match('^([^\t]+)\t(%d+)\t([a-z]+)\t?(%d*)$');seq=tonumber(seq);scope=tonumber(scope);if token~=cfg.token or not seq or seq<=last then return end;last=seq
  context()
  if op=='capture' then if not paused()then togglePause();ownedPause=true;ownedTick=gameTime();ownedRound=roundNo();ownedSequence=seq end;pending={seq=seq,tick=gameTime(),round=roundNo(),frames=0}
  elseif op=='probe' then if not paused()or gameTime()~=heldTick or roundNo()~=heldRound then error('The inspected held tick is no longer active.')end;write(shot(seq))
  elseif op=='resume' or op=='cancel' then local permitted=op=='resume' or ownedSequence==scope;local released=permitted and ownedPause and paused()and gameTime()==ownedTick and roundNo()==ownedRound;if released then togglePause()end;if permitted then ownedPause=false;ownedTick=nil;ownedRound=nil;ownedSequence=nil;heldTick=nil end;write({token=cfg.token,sequence=seq,resumed=true,released=released,paused=paused()})
  else error('Unknown inspector request.')end
 end)
 if not ok then local captureFailed=pending~=nil;if captureFailed and pending.seq==ownedSequence and ownedPause and paused()and gameTime()==ownedTick and roundNo()==ownedRound then togglePause();ownedPause=false;ownedTick=nil;ownedRound=nil end;if savedFolder then pcall(modifyGameOption,'Config.ScreenshotFolder',savedFolder);savedFolder=nil end;pending=nil;write({token=cfg.token,sequence=last,error=tostring(err)})end
end)
