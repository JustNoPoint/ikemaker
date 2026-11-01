'use strict';

const assert = require('assert');
const { switchToIkeMiner } = require('../src/companion_switch');

(async () => {
  const information = [], errors = [], calls = [];
  const api = {
    extensions: { getExtension: () => undefined },
    commands: { executeCommand: async command => calls.push(command) },
    window: {
      showInformationMessage: message => information.push(message),
      showErrorMessage: message => errors.push(message)
    }
  };

  assert.strictEqual(await switchToIkeMiner(api), false);
  assert.deepStrictEqual(calls, [], 'a missing companion must not execute an unknown command');
  assert.match(information[0], /IKEMaker stayed open/);

  api.extensions.getExtension = () => ({ id: 'justnopoint.ikeminer' });
  assert.strictEqual(await switchToIkeMiner(api), true);
  assert.deepStrictEqual(calls, ['ikeminer.open']);

  api.commands.executeCommand = async () => { throw new Error('activation failed'); };
  assert.strictEqual(await switchToIkeMiner(api), false);
  assert.match(errors[0], /activation failed/);
  assert.match(errors[0], /IKEMaker stayed open/);

  console.log('IKEMaker companion switch safety tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
