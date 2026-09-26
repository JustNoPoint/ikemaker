'use strict';

const path = require('path');
const { blankSff, blankSnd } = require('./asset_templates');
const { transactionalWriteSet } = require('./mutation_safety');

function safeStem(value) {
  const stem = String(value || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^\.+|\.+$/g, '');
  if (!stem || stem === '.' || stem === '..') throw new Error('Choose a character file name containing letters or numbers.');
  return stem;
}

function displayFromStem(stem) {
  return safeStem(stem).replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function iniText(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim();
}

function normalizeEngineTarget(value) { return value === 'mugen-cns' ? 'mugen-cns' : 'ikemen-zss'; }
function normalizeInputExtension(value) {
  const extension = String(value || 'inp').trim().replace(/^\.+/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,15}$/.test(extension)) throw new Error('Input extensions must contain 2–16 letters, numbers, underscores, or hyphens.');
  return extension;
}
function normalizeSffVersion(engineTarget, value) {
  if (normalizeEngineTarget(engineTarget) === 'ikemen-zss') return '2.1';
  return value === '2.1' ? '2.1' : '2.0';
}
function engineLabel(value, sffVersion = '2.0') {
  if (normalizeEngineTarget(value) !== 'mugen-cns') return 'IKEMEN 1.0 / ZSS';
  return normalizeSffVersion(value, sffVersion) === '2.1' ? 'MUGEN 1.1 / CNS' : 'MUGEN 1.0 / CNS';
}

function characterDef(stem, displayName, author, engineTarget = 'ikemen-zss', sffVersion = '2.1', inputExtension = 'inp') {
  const engine = normalizeEngineTarget(engineTarget), mugen = engine === 'mugen-cns', version = normalizeSffVersion(engine, sffVersion);
  const inputExt = normalizeInputExtension(inputExtension);
  return `; ${engineLabel(engine, version)} character definition\n[Info]\nname = "${iniText(stem)}"\ndisplayname = "${iniText(displayName)}"\nauthor = "${iniText(author)}"\n${mugen ? `mugenversion = ${version === '2.1' ? '1.1' : '1.0'}` : 'ikemenversion = 1.0'}\nlocalcoord = 320,240\npal.defaults = 1\n\n[Files]\ncmd = ${stem}.${inputExt}\ncns = ${stem}.cns\nst = ${stem}${mugen ? '_states.cns' : '.zss'}\nstcommon = ${mugen ? 'common1.cns' : 'common1.cns.zss'}\nsprite = ${stem}.sff\nanim = ${stem}.air\nsound = ${stem}.snd\n${mugen ? '' : `movelist = ${stem}_movelist.dat\n`}`;
}

function characterCns(engineTarget = 'ikemen-zss') {
  const ikemen = normalizeEngineTarget(engineTarget) === 'ikemen-zss';
  return `; ${engineLabel(engineTarget)} starter constants\n; These comments are creation-time guidance. IKEMaker does not inject them into existing user constants.\n[Data]\nlife = 1000\npower = 3000\n${ikemen ? '; IKEMEN: maximum dizzy and guard resources; each defaults to life when omitted.\ndizzypoints = 1000\nguardpoints = 1000\n' : ''}attack = 100\ndefence = 100\nfall.defence_up = 50\nliedown.time = 60\nairjuggle = 15\nsparkno = 2\nguard.sparkno = 40\n${ikemen ? '; IKEMEN: default HitDef sound channels. -1 uses any free channel.\nhitsound.channel = -1\nguardsound.channel = -1\n; IKEMEN: percentage volume; this supersedes legacy volume when present.\nvolumescale = 100\n' : ''}\n[Size]\nxscale = 1\nyscale = 1\n; Legacy MUGEN width and height fallbacks.\nground.back = 15\nground.front = 16\nair.back = 12\nair.front = 12\nheight = 60\nattack.dist = 160\nproj.attack.dist = 90\nhead.pos = -5,-90\nmid.pos = -5,-60\nshadowoffset = 0\ndraw.offset = 0,0\n${ikemen ? '; IKEMEN: native push rectangles override the legacy width/height values above.\nstand.sizebox = -15,-60,16,0\ncrouch.sizebox = -15,-45,16,0\nair.sizebox = -12,-60,12,0\ndown.sizebox = -20,-20,20,0\n; IKEMEN: proximity-guard regions in X, Y, and Z/depth.\nattack.dist.width = 160,0\nattack.dist.height = 0,0\nattack.dist.depth = 0,0\nproj.attack.dist.width = 90,0\nproj.attack.dist.height = 0,0\nproj.attack.dist.depth = 0,0\n; IKEMEN: Z-axis body/attack depth, relative weight, and overlap resolution.\ndepth = 3,3\nattack.depth = 4,4\nweight = 100\npushfactor = 1\n' : ''}\n[Velocity]\nwalk.fwd = 2.4\nwalk.back = -2.2\nrun.fwd = 4.6,0\nrun.back = -4.5,-3.8\njump.neu = 0,-8.4\njump.back = -2.55\njump.fwd = 2.5\nrunjump.back = -2.55\nrunjump.fwd = 4\nairjump.neu = 0,-8.1\nairjump.back = -2.55\nairjump.fwd = 2.5\n${ikemen ? '; IKEMEN: additional airborne and grounded KO velocity policy.\nair.gethit.ko.add = -2.5,-2,0\nair.gethit.ko.ymin = -3\nground.gethit.ko.xmul = .66\nground.gethit.ko.add = -2.5,-2,0\nground.gethit.ko.ymin = -6\n; IKEMEN: optional three-axis movement velocities (x, y, z).\nwalk.up = 0,0,0\nwalk.down = 0,0,0\nrun.up = 0,0,0\nrun.down = 0,0,0\njump.up = 0,0,0\njump.down = 0,0,0\nrunjump.up = 0,0,0\nrunjump.down = 0,0,0\nairjump.up = 0,0,0\nairjump.down = 0,0,0\n' : ''}\n[Movement]\nairjump.num = 0\nairjump.height = 35\nyaccel = 0.44\nstand.friction = 0.85\ncrouch.friction = 0.82\nstand.friction.threshold = 2\ncrouch.friction.threshold = 0.05\n${ikemen ? '\n[Constants]\n; IKEMEN: add project or character constants here. Names cannot contain spaces or brackets.\n; These character values override matching defaults in data/common.const.\n' : ''}`;
}

function normalizeScaffoldStyle(value) {
  return value === 'minimal' ? 'minimal' : 'guided';
}

function scaffoldChoices(experience = 'learning') {
  const choices = [
    { label: 'Guided starter', description: 'Includes one clearly labeled X / State 200 teaching example.', value: 'guided' },
    { label: 'Clean baseline', description: 'Creates the same native file boundaries without an example attack.', value: 'minimal' }
  ];
  if (experience === 'advanced') choices.reverse();
  return choices.map((choice, index) => ({ ...choice, recommended: index === 0 }));
}

function characterCommands(_style = 'guided', engineTarget = 'ikemen-zss') {
  const ikemen = normalizeEngineTarget(engineTarget) === 'ikemen-zss', buttons = ['x', 'y', 'z', 'a', 'b', 'c'];
  const command = (name, input, time = 1) => `\n[Command]\nname = "${name}"\ncommand = ${input}\ntime = ${time}\n`;
  return `; ${engineLabel(engineTarget)} starter commands\n; Required common-state commands are labeled and should not be removed.\n[Remap]\nx = x\ny = y\nz = z\na = a\nb = b\nc = c\ns = s\n${ikemen ? 'd = d\nw = w\n' : ''}\n[Defaults]\ncommand.time = 15\ncommand.buffer.time = 1\n${command('FF', 'F, F', 10)}${command('BB', 'B, B', 10)}${command('recovery', 'x+y')}${buttons.map((button) => command(button, button, 3)).join('')}${command('start', 's')}${ikemen ? command('d', 'd') + command('w', 'w') : ''}${command('holdfwd', '/$F')}${command('holdback', '/$B')}${command('holdup', '/$U')}${command('holddown', '/$D')}`;
}

function characterAir(engineTarget = 'ikemen-zss') {
  return `; ${engineLabel(engineTarget)} starter AIR\n; Sprite 0,0 is intentionally not supplied. Add the required sprite in the SFF workspace.\n\n[Begin Action 0]\n0,0, 0,0, -1\n`;
}

function characterStateSource(stem, style = 'guided', engineTarget = 'ikemen-zss') {
  if (normalizeEngineTarget(engineTarget) === 'mugen-cns') {
    if (normalizeScaffoldStyle(style) === 'minimal') return `; MUGEN 1.0 clean state baseline for ${stem}\n\n[Statedef -1]\n`;
    return `; MUGEN 1.0 guided starter states for ${stem}\n\n[Statedef -1]\n\n[State -1, Standing X teaching example]\ntype = ChangeState\nvalue = 200\ntriggerall = command = "x"\ntrigger1 = statetype = S\ntrigger1 = ctrl\n\n[Statedef 200]\ntype = S\nmovetype = A\nphysics = S\nanim = 200\nctrl = 0\n\n[State 200, Return to standing]\ntype = ChangeState\ntrigger1 = AnimTime = 0\nvalue = 0\nctrl = 1\n`;
  }
  if (normalizeScaffoldStyle(style) === 'minimal') return `# IKEMEN 1.0 clean state baseline for ${stem}\n# Common movement states remain engine-owned until you deliberately replace them.\n# Add only character-owned commands, states, and shared-module calls here.\n\n[StateDef -1]\n`;
  return `# IKEMEN 1.0 guided starter states for ${stem}\n# Common movement states remain engine-owned until you author replacements.\n\n[StateDef -1]\n\n# Learning example: press X while standing to enter State 200.\nif ctrl && stateType = S && command = "x" {\n\tchangeState{value: 200}\n}\n\n[StateDef 200; type: S; moveType: A; physics: S]\n\nif time = 0 {\n\tchangeAnim{value: 200}\n}\n\nif animTime = 0 {\n\tchangeState{value: const(StateStand); ctrl: true}\n}\n`;
}
function characterZss(stem, style = 'guided') { return characterStateSource(stem, style, 'ikemen-zss'); }

function characterReadme(stem, style = 'guided', engineTarget = 'ikemen-zss') {
  const engine = normalizeEngineTarget(engineTarget), mugen = engine === 'mugen-cns';
  const profile = normalizeScaffoldStyle(style) === 'minimal'
    ? 'Clean baseline: no example attack command or attack state was added.'
    : 'Guided starter: command X and State 200 are intentionally small teaching examples, not a finished normal.';
  return `# ${stem} ${engineLabel(engine)} starter\n\n${profile}\nThe starter creates ${mugen ? 'MUGEN-compatible CNS' : 'native IKEMEN ZSS'} file ownership boundaries without inventing a game system.\n\n## Required first review\n\n- Add sprite 0,0 and the required movement sprites to ${stem}.sff. The new SFF is structurally valid but contains no artwork.\n- Replace the placeholder AIR action and author the required movement actions and collision boxes.\n- Review localcoord in ${stem}.def before measuring positions or importing production sprites.\n- Review life, movement, Size, head position, and mid position in ${stem}.cns.\n- Common-state contract: ${mugen ? 'data/common1.cns' : 'data/common1.cns.zss plus data/common.cmd'}. IKEMaker checks this during creation.\n- The SND is intentionally empty. Add character effects${mugen ? '' : ' or assign split voice/effect archives'} only when the character needs them.\n- Add project requirements explicitly, then run the extension requirement audit before the first complete movement test.\n\n## Safety boundary\n\nThe creator never overwrites an existing file. Learning and Advanced modes only recommend a scaffold style; the style selected in the creation dialog is authoritative. Explanatory constants comments are added only to newly generated files.\n`;
}

function createCharacterPlan(defPath, options = {}) {
  const directory = path.dirname(defPath);
  const stem = safeStem(path.basename(defPath, path.extname(defPath)));
  const displayName = options.displayName || displayFromStem(stem);
  const style = normalizeScaffoldStyle(options.style);
  const engineTarget = normalizeEngineTarget(options.engineTarget);
  const sffVersion = normalizeSffVersion(engineTarget, options.sffVersion);
  const inputExtension = normalizeInputExtension(options.inputExtension);
  const stateName = engineTarget === 'mugen-cns' ? `${stem}_states.cns` : `${stem}.zss`;
  const inputName = `${stem}.${inputExtension}`;
  const files = new Map([
    [path.join(directory, `${stem}.def`), characterDef(stem, displayName, options.author || '', engineTarget, sffVersion, inputExtension)],
    [path.join(directory, `${stem}.cns`), characterCns(engineTarget)],
    [path.join(directory, inputName), characterCommands(style, engineTarget)],
    [path.join(directory, stateName), characterStateSource(stem, style, engineTarget)],
    [path.join(directory, `${stem}.air`), characterAir(engineTarget)],
    [path.join(directory, `${stem}.sff`), blankSff(sffVersion)],
    [path.join(directory, `${stem}.snd`), blankSnd()],
    [path.join(directory, 'README.md'), characterReadme(stem, style, engineTarget)]
  ]);
  if (engineTarget === 'ikemen-zss') files.set(path.join(directory, `${stem}_movelist.dat`), '; IKEMEN pause-menu movelist\n; Add move entries with the Command and Movelist Editor.\n');
  return { directory, stem, displayName, style, engineTarget, sffVersion, inputExtension, defPath: path.join(directory, `${stem}.def`), files };
}

function creationReview(plan) {
  const style = normalizeScaffoldStyle(plan && plan.style), engine = normalizeEngineTarget(plan && plan.engineTarget);
  return {
    title: `${engineLabel(engine, plan.sffVersion)} · SFF ${plan.sffVersion} · ${style === 'minimal' ? 'Clean baseline' : 'Guided starter'}`,
    files: [...plan.files.keys()].map((filename) => path.basename(filename)),
    dependencies: [
      'SFF: structurally valid and empty; add sprite 0,0 and required movement sprites.',
      'AIR: placeholder Action 0 references sprite 0,0; author movement actions and collision.',
      'DEF/CNS: review localcoord, life, movement, Size, head position, and mid position.',
      `Input (.${plan.inputExtension}): required MUGEN commands are included${engine === 'ikemen-zss' ? '; D and W are added for IKEMEN' : ''}. ${style === 'minimal' ? 'No example attack state was added.' : 'State 200 is a teaching example and requires matching animation work.'}`,
      `Commons: expects ${engine === 'mugen-cns' ? 'data/common1.cns' : 'data/common1.cns.zss and data/common.cmd'}.`,
      'SND: structurally valid and empty; no combined or language-specific archive is invented.',
      'Existing files are never replaced.'
    ]
  };
}

function writeCharacterPlan(fs, plan, options = {}) {
  const conflicts = [...plan.files.keys()].filter((filename) => fs.existsSync(filename));
  if (conflicts.length) throw new Error(`Nothing was created because these files already exist: ${conflicts.map((filename) => path.basename(filename)).join(', ')}`);
  fs.mkdirSync(plan.directory, { recursive: true });
  transactionalWriteSet(fs, [...plan.files.entries()], { allowExisting: false, backup: false, journal: false, ...options });
  return [...plan.files.keys()];
}

module.exports = { safeStem, displayFromStem, iniText, normalizeEngineTarget, normalizeInputExtension, normalizeSffVersion, engineLabel, normalizeScaffoldStyle, scaffoldChoices, characterDef, characterCns, characterCommands, characterAir, characterStateSource, characterZss, characterReadme, createCharacterPlan, creationReview, writeCharacterPlan };
