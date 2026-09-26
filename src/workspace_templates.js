'use strict';

function stageDef(name = 'New Stage', sff = 'New_Stage.sff') {
  return `[Info]
name = "${name}"
displayname = "${name}"
author = ""

[Camera]
startx = 0
starty = 0
boundleft = -160
boundright = 160
boundhigh = -25
boundlow = 0
verticalfollow = 0.2
tension = 50
floortension = 0
startzoom = 1
zoomin = 1
zoomout = 1

[PlayerInfo]
p1startx = -70
p1starty = 0
p1facing = 1
p2startx = 70
p2starty = 0
p2facing = -1
leftbound = -1000
rightbound = 1000

[Bound]
screenleft = 15
screenright = 15

[StageInfo]
localcoord = 320,240
zoffset = 220
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

function screenpackDef() {
  return `[Info]
name = "New Screenpack"
author = ""
localcoord = 320,240

[Files]
spr = system.sff
fight = fight.def

[Title Info]
menu.pos = 160,120
menu.item.font = 0,0,0
menu.window = 20,40,300,220
footer.version.text = Version 0.0

[Select Info]
pos = 160,120
cell.bg.spr = 0,0
`;
}

function fightDef() {
  return `[Info]
name = "New Fight UI"
author = ""
localcoord = 320,240

[Files]
spr = fight.sff

[Lifebar]
p1.pos = 20,20
p1.bg0.spr = 0,0
p2.pos = 300,20
p2.bg0.spr = 0,0

[Round]
pos = 160,50
`;
}

module.exports = { stageDef, screenpackDef, fightDef };
