'use strict';

// Where catalog definitions go in the owner's command file, and how complex each existing command is.
//
// Engine fact (IKEMEN GO v1.0.0 input.go CommandList.Step): every [Command] is stepped every tick
// independently, so the order of [Command] blocks does not change recognition. It is organization only
// (same-named definitions interact through buffer.shared regardless of position). The order that decides
// which move wins is the State -1 route order, checked by command_route_order.js.

const { splitSteps, nativeInputAtoms } = require('./command_movelist_model');

const DIRECTION = /(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRN])$/;
const BUTTON = /(?:^|[^A-Za-z])([xyzabcswdm])$/;

// Complexity: direction steps + final buttons (+1 for a release ending). Larger = harder to complete.
function commandComplexity(command) {
  const steps = splitSteps(String(command || ''));
  let directions = 0, buttons = 0, release = false;
  steps.forEach((step, index) => {
    const atoms = nativeInputAtoms(step);
    const stepButtons = atoms.filter(atom => BUTTON.test(atom) && !DIRECTION.test(atom.replace(/[xyzabcswdm]$/, 'X')));
    if (atoms.some(atom => DIRECTION.test(atom) && !/[xyzabcswdm]$/.test(atom))) directions += 1;
    if (index === steps.length - 1) { buttons = stepButtons.length; release = stepButtons.length > 0 && stepButtons.every(atom => atom.includes('~')); }
    else buttons += stepButtons.length;
  });
  return { directions, buttons, release, score: directions + buttons + (release ? 1 : 0) };
}

function placementRows(commands = []) {
  return commands.map((command, index) => ({ index, name: command.name || '(unnamed)', command: command.command || '', line: command.startLine, complexity: commandComplexity(command.command).score }));
}

// Suggested beforeIndex for new definitions of `familyId` (names compared case-insensitively by stem):
// after the owner's last command of the same family; else before the first less complex command (the
// common complex-first convention); else at the end (null).
function suggestPlacement(commands = [], { familyId = '', complexity = 0 } = {}) {
  const rows = placementRows(commands);
  const stem = String(familyId).toLowerCase();
  const sameFamily = rows.filter(row => row.name.toLowerCase() === stem || row.name.toLowerCase().startsWith(stem + '_'));
  if (sameFamily.length) {
    const last = sameFamily[sameFamily.length - 1].index;
    return { beforeIndex: last + 1 < rows.length ? last + 1 : null, reason: `After the existing ${sameFamily.map(row => row.name).slice(0, 3).join(', ')}${sameFamily.length > 3 ? ', …' : ''} definitions.` };
  }
  const lighter = rows.find(row => row.complexity > 0 && row.complexity < complexity);
  if (lighter) return { beforeIndex: lighter.index, reason: `Before ${lighter.name}, the first less complex command (complex commands first).` };
  return { beforeIndex: null, reason: 'At the end of the command file.' };
}

// What sits directly below a chosen position, for the "is the command below less complex?" note.
function placementNote(commands = [], beforeIndex, complexity) {
  const rows = placementRows(commands);
  const below = beforeIndex === null || beforeIndex === undefined || beforeIndex === '' ? null : rows[Number(beforeIndex)];
  if (!below) return { status: 'end', text: 'Added at the end of the command file.' };
  const relation = below.complexity < complexity ? 'less complex' : below.complexity === complexity ? 'equally complex' : 'more complex';
  return { status: relation === 'more complex' ? 'review' : 'ok', below: below.name, text: `Below it: ${below.name} (${below.command}) is ${relation}. Order in the command file does not change recognition; State -1 route order does.` };
}

module.exports = { commandComplexity, placementRows, suggestPlacement, placementNote };
