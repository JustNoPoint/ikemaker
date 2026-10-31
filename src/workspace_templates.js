'use strict';

function coordinates(options = {}) {
  const value = Array.isArray(options.localCoord) ? options.localCoord : [320, 240];
  return [Math.max(1, Math.trunc(Number(value[0])) || 320), Math.max(1, Math.trunc(Number(value[1])) || 240)];
}

function quoted(value) { return String(value || '').replace(/[\r\n"]/g, ' ').trim(); }

function stageDef(name = 'New Stage', sff = 'New_Stage.sff', options = {}) {
  const [width, height] = coordinates(options), halfWidth = Math.round(width / 2);
  const playerStart = Math.max(1, Math.round(width * 70 / 320)), zOffset = Math.max(1, Math.round(height * 220 / 240));
  return `[Info]
name = "${name}"
displayname = "${name}"
author = "${quoted(options.author)}"

[Camera]
startx = 0
starty = 0
boundleft = -${halfWidth}
boundright = ${halfWidth}
boundhigh = -25
boundlow = 0
verticalfollow = 0.2
tension = 50
floortension = 0
startzoom = 1
zoomin = 1
zoomout = 1

[PlayerInfo]
p1startx = -${playerStart}
p1starty = 0
p1facing = 1
p2startx = ${playerStart}
p2starty = 0
p2facing = -1
leftbound = -1000
rightbound = 1000

[Bound]
screenleft = 15
screenright = 15

[StageInfo]
localcoord = ${width},${height}
zoffset = ${zOffset}
autoturn = 1
resetbg = 1
xscale = 1
yscale = 1

[Shadow]
intensity = 128
color = 0,0,0
yscale = 0.4

[Reflection]
intensity = 0

[Music]
bgmusic =

[BGDef]
spr = ${sff}
debugbg = 1

[BG Starter]
type = normal
spriteno = 0,0
start = 0,0
delta = 1,1
layerno = 0
`;
}

function screenpackDef(options = {}) {
  const [width, height] = coordinates(options), centerX = Math.round(width / 2), centerY = Math.round(height / 2);
  const marginX = Math.max(1, Math.round(width / 16)), marginY = Math.max(1, Math.round(height / 6));
  return `[Info]
name = "${quoted(options.name) || 'New Screenpack'}"
author = "${quoted(options.author)}"
localcoord = ${width},${height}

[Files]
spr = system.sff
fight = ${quoted(options.fightFile) || 'fight.def'}

[Title Info]
menu.pos = ${centerX},${centerY}
menu.item.font = 0,0,0
menu.window = ${marginX},${marginY},${width - marginX},${height - Math.max(1, Math.round(height / 12))}
footer.version.text = Version 0.0

[Select Info]
pos = ${centerX},${centerY}
cell.bg.spr = 0,0
`;
}

function fightDef(options = {}) {
  const [width, height] = coordinates(options), marginX = Math.max(1, Math.round(width / 16)), marginY = Math.max(1, Math.round(height / 12));
  return `[Info]
name = "${quoted(options.name) || 'New Fight UI'}"
author = "${quoted(options.author)}"
localcoord = ${width},${height}

[Files]
spr = fight.sff

[Lifebar]
p1.pos = ${marginX},${marginY}
p1.bg0.spr = 0,0
p2.pos = ${width - marginX},${marginY}
p2.bg0.spr = 0,0

[Round]
pos = ${Math.round(width / 2)},${Math.max(1, Math.round(height * 50 / 240))}
`;
}

module.exports = { coordinates, stageDef, screenpackDef, fightDef };
