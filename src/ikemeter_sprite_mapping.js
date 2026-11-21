'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const writer = require('./reviewed_workspace_patch_writer');
const {
  evidenceIssue, verifyFiles, verifyDocument, replacementPlan, spriteChoices, OWN_STATE_RELATION, STALE, samePath
} = require('./ikemeter_sprite_mapping_model');

const ACTION = 'Review sprite mapping';
const APPLY = 'Apply sprite mapping';
const CANCEL = 'Cancel review';
const SCHEME = 'ikemaker-sprite-mapping-review';
const providers = new WeakMap();

function acquire(vscode) {
  const key = vscode.workspace.registerTextDocumentContentProvider;
  let state = providers.get(key);
  if (!state) {
    const contents = new Map();
    state = {
      contents, count: 0,
      registration: vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
        provideTextDocumentContent: uri => contents.get(uri.toString()) ?? 'This sprite mapping review has closed.'
      })
    };
    providers.set(key, state);
  }
  state.count++;
  return {
    contents: state.contents,
    release() {
      if (--state.count === 0) {
        state.registration.dispose();
        providers.delete(key);
      }
    }
  };
}

function notify(vscode, method, message) {
  void Promise.resolve(vscode.window[method](message)).catch(() => {});
}

function mappingDescription(controller) {
  const mapping = 'This RemapSprite controller lists ' + controller.source.key + ' as the source and ' + controller.dest.key + ' as the destination.';
  return mapping + ' Its triggers determine whether the controller runs. The coordinates are checked against the owner’s assigned SFF.';
}

function pickSprite(vscode, entries, controller, closed) {
  const picker = vscode.window.createQuickPick();
  picker.ignoreFocusOut = true;
  picker.title = ACTION + ' · ' + controller.source.key + ' → ' + controller.dest.key;
  picker.matchOnDescription = false;
  picker.matchOnDetail = false;
  const resources = [picker];
  let resolve;
  const result = new Promise(done => { resolve = done; });
  function update() {
    const { items, exceedsLimit } = spriteChoices(entries, picker.value);
    picker.items = items;
    picker.placeholder = exceedsLimit ? 'Refine search by group,image to see more coordinates'
      : 'Choose an existing destination by group,image';
  }
  resources.push(picker.onDidChangeValue(update), picker.onDidHide(() => resolve(undefined)),
    picker.onDidAccept(() => {
      const selected = picker.selectedItems[0];
      if (!selected?.available) return;
      resolve(selected.key);
    }));
  update();
  picker.show();
  return Promise.race([result, closed]).finally(() => {
    for (const item of resources.reverse()) item.dispose();
  });
}

function sameOperation(left, right) {
  return right && Object.keys(left).every(key => left[key] === right[key]);
}

function presentDiff(vscode, scoped, file, before, after, controller, chosen, apply) {
  const provider = acquire(vscode);
  const uri = side => vscode.Uri.from({
    scheme: SCHEME, authority: scoped.token, path: '/' + side + '/' + path.basename(file.source.filename)
  });
  const original = uri('before');
  const modified = uri('after');
  const owned = tab => tab?.input?.original?.toString() === original.toString() &&
    tab.input?.modified?.toString() === modified.toString();
  const tabGroups = vscode.window.tabGroups;
  const tabs = () => tabGroups.all.flatMap(group => group.tabs).filter(owned);
  const resources = [];
  let finished = false;
  let opening;
  function closeOwnedTabs() {
    const open = tabs();
    if (open.length) void Promise.resolve(tabGroups.close(open, true)).catch(() => {});
  }
  function cleanup() {
    if (finished) return;
    finished = true;
    for (const item of resources.reverse()) item.dispose();
    provider.contents.delete(original.toString());
    provider.contents.delete(modified.toString());
    provider.release();
    closeOwnedTabs();
    // The native command may open the exact tab after this review has closed.
    void opening?.then(closeOwnedTabs, closeOwnedTabs).catch(() => {});
  }

  const detail = mappingDescription(controller) + ' This preview changes the destination in the owner’s state file to ' +
    chosen + '. Apply leaves the edit unsaved.';
  const result = (async () => {
    try {
      provider.contents.set(original.toString(), before);
      provider.contents.set(modified.toString(), after);
      resources.push(tabGroups.onDidChangeTabs(event => {
        if (event.closed.some(owned)) scoped.close();
      }));
      opening = Promise.resolve(vscode.commands.executeCommand('vscode.diff', original, modified,
        ACTION + ' · ' + path.basename(file.source.filename) + ' · ' + controller.dest.key + ' → ' + chosen, { preview: false }));
      await Promise.race([opening, scoped.closed]);
      if (!scoped.isLive()) return false;
      if (!tabs().length) return false;

      let resolve, reject;
      const decision = new Promise((done, fail) => { resolve = done; reject = fail; });
      const submit = () => {
        if (!scoped.isLive()) return;
        if (!owned(tabGroups.activeTabGroup.activeTab)) {
          notify(vscode, 'showInformationMessage', 'Focus the sprite mapping diff for ' + path.basename(file.source.filename) + ' and choose Apply sprite mapping.');
          return;
        }
        try {
          // Recheck every authority and submit the native edit synchronously.
          void Promise.resolve(apply()).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      };
      const cancel = () => resolve(false);
      const actions = [
        ['apply', '$(check) ' + APPLY + ' · ' + path.basename(file.source.filename), detail, submit],
        ['cancel', '$(close) ' + CANCEL, 'Close the sprite mapping preview.', cancel]
      ];
      for (const [suffix, text, tooltip, callback] of actions) {
        const command = 'ikemen.spriteMappingReview.' + scoped.token + '.' + suffix;
        resources.push(vscode.commands.registerCommand(command, callback));
        const button = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000000);
        resources.push(button);
        Object.assign(button, { text, tooltip, command });
        button.show();
      }
      // The notification keeps both decisions accessible when the status bar
      // drops items in a narrow window. Dismissing it leaves the diff open.
      void Promise.resolve(vscode.window.showInformationMessage(
        path.basename(file.source.filename) + ' · ' + detail, APPLY, CANCEL
      )).then(choice => {
        if (choice === APPLY) submit();
        if (choice === CANCEL) cancel();
      }).catch(() => {});
      return await Promise.race([decision, scoped.closed]);
    } finally {
      cleanup();
    }
  })();
  return result;
}

function createSpriteMappingReview(vscode, services = {}) {
  const live = new Map();
  const applying = new Set();
  let disposed = false;
  let latestReceipt;
  const pendingSffClean = services.pendingSffClean || (filename => require('./sff_viewer').quickTransferDestinationClean(filename));
  const verify = (request, expected) => {
    const file = verifyFiles(vscode, request, services.parseSff, expected);
    if (pendingSffClean(file.sff.filename) !== true) throw new Error('Finish pending changes in the SFF viewer before review.');
    return file;
  };

  async function review(input) {
    if (disposed) return false;
    const request = {
      mapping: input.mapping && Object.freeze({ ...input.mapping }),
      finding: structuredClone(input.finding),
      runtime: input.runtime && Object.freeze({ ...input.runtime }),
      importSha256: input.importSha256,
      isCurrent: input.isCurrent
    };
    let scoped;
    let invalidated = false;
    let subscription, closeSource;
    let submitted = false;
    try {
      const initial = verify(request);
      const filename = initial.source.filename;
      const pathKey = process.platform === 'win32' ? filename.toLowerCase() : filename;
      if (applying.has(pathKey)) return false;
      live.get(pathKey)?.close();
      let resolveClosed;
      scoped = {
        token: randomUUID(),
        closed: new Promise(resolve => { resolveClosed = resolve; }),
        isLive: () => live.get(pathKey) === scoped && !disposed && !submitted,
        close() {
          if (submitted) return;
          if (live.get(pathKey) === scoped) live.delete(pathKey);
          resolveClosed(false);
        }
      };
      live.set(pathKey, scoped);

      const document = await Promise.race([
        vscode.workspace.openTextDocument(vscode.Uri.file(filename)), scoped.closed
      ]);
      if (!scoped.isLive() || !document) return false;
      const range = request.finding.locator.range;
      const file = verify(request, initial);
      const version = document.version;
      const verified = verifyDocument(file, document, range, version);
      const onSourceChange = changed => {
        if (!submitted && samePath(changed?.uri?.fsPath, filename)) {
          invalidated = true;
          scoped.close();
        }
      };
      subscription = vscode.workspace.onDidChangeTextDocument(event => onSourceChange(event.document));
      closeSource = vscode.workspace.onDidCloseTextDocument(onSourceChange);
      const chosen = await pickSprite(vscode, file.entries, verified.controller, scoped.closed);
      if (!scoped.isLive() || chosen === undefined) return false;
      verifyDocument(file, document, range, version);
      const plan = replacementPlan(file, document, verified, chosen);
      if (!plan) {
        notify(vscode, 'showInformationMessage', 'This controller already maps to this sprite.');
        return false;
      }

      function apply() {
        if (!scoped.isLive() || applying.has(pathKey)) return false;
        try {
          const current = verify(request, file);
          const source = verifyDocument(current, document, range, version);
          const next = replacementPlan(current, document, source, chosen);
          if (source.controller.line !== verified.controller.line || !sameOperation(plan.operation, next?.operation)) {
            throw new Error(STALE);
          }
        } catch {
          invalidated = true;
          scoped.close();
          return false;
        }
        submitted = true;
        applying.add(pathKey);
        return writer.applyReviewedWorkspacePatch(document, plan.operation, vscode).then(result => {
          latestReceipt = Object.freeze({
            importSha256: request.importSha256, findingId: request.finding.id, previewToken: scoped.token,
            sourcePath: file.source.filename, sourceSha256: file.source.hash, defSha256: file.owner.hash, sffSha256: file.sff.hash,
            documentVersion: version, controllerLine: verified.controller.line + 1, oldPair: verified.controller.dest.key,
            newPair: chosen, afterHash: result.afterHash.toLowerCase()
          });
          notify(vscode, 'showInformationMessage', 'Edited, not saved. Save the file, then capture again with IKeMeter to observe the result.');
          return true;
        }).finally(() => {
          applying.delete(pathKey);
          if (live.get(pathKey) === scoped) live.delete(pathKey);
        });
      }
      return await presentDiff(vscode, scoped, file, verified.text, plan.after, verified.controller, chosen, apply);
    } catch (error) {
      if (submitted) {
        const changed = error?.code === 'reviewed-workspace-patch:postcondition';
        notify(vscode, 'showWarningMessage', changed
          ? 'The editor result differed from the preview. Inspect the source document before saving.'
          : 'The editor could not apply the reviewed sprite mapping.');
      } else {
        // Filesystem exceptions can include absolute paths and implementation details.
        const reason = error?.code ? 'A required local file or editor surface is unavailable.' : error.message;
        notify(vscode, 'showInformationMessage', ACTION + ' · Not eligible. ' + reason);
      }
      return false;
    } finally {
      subscription?.dispose();
      closeSource?.dispose();
      scoped?.close();
      if (invalidated) notify(vscode, 'showWarningMessage', STALE);
    }
  }

  return {
    review, evidenceIssue,
    latestReceipt: () => latestReceipt,
    dispose() {
      disposed = true;
      for (const scoped of live.values()) scoped.close();
    }
  };
}

module.exports = { ACTION, OWN_STATE_RELATION, createSpriteMappingReview };
