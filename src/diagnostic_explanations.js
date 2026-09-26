'use strict';

const EXPLANATIONS = Object.freeze({
  'negative-time-zero': ['Negative-state time = 0', 'Negative StateDefs run outside an ordinary owned state timeline, so time = 0 may depend on engine and processing order.', ['Use a reviewed entry latch for exactly-once work.', 'Use time <= 1 only when a two-tick window is intentionally safe.', 'Use # @time-zero engine only for a verified native common-state contract.']],
  'redirect-guard': ['Redirect validity guard', 'The redirected entity can be absent during team transitions, helper destruction, target release, or other lifecycle frames.', ['Check the matching numHelper, numTarget, numEnemy, or numPartner in the same visible condition.', 'Do not assume a redirect remains valid because it existed on the previous tick.']],
  'root-context': ['Root ownership assumption', 'root is valid only while this code is executing for a helper with the intended owner.', ['Document whether the function is helper-only.', 'If it is shared, branch on helper ownership before root access.']],
  'opponent-guard': ['Optional author rule: P2 redirection', 'This identified-author heuristic reviews actual `P2, ...` redirects. It does not apply to p2dist, p2life, p2stateno, or other p2-prefixed triggers. P2 is a persistent engine-selected opponent, not simply enemyNear, and is not inherently wrong in Simul.', ['Verify that the current P2 selection is the intended opponent.', 'Use an explicit guard or target/ID ownership only when the surrounding operation and author convention require it.']],
  'team-mode': ['Team-mode assumption', 'partner behavior is meaningful only in team modes where a partner exists and the intended rules apply.', ['Check teamMode when behavior differs by mode.', 'Check numPartner before redirected access.']],
  'literal-player-slot': ['Literal player slot', 'A numbered player slot is a runtime allocation detail and is fragile across team modes.', ['Prefer playerID, enemy, partner, target, or teamLeader.', 'Store an ID through an explicit handshake when a lasting relationship is required.']],
  'targetstate-guard': ['TargetState ownership', 'A target can be released or replaced before TargetState executes.', ['Check numTarget in the same visible condition.', 'Confirm who owns position, facing, and synchronization after transfer.']],
  'customstate-contract': ['Custom-state contract', 'The transfer has no nearby author note describing controller, position, facing, or synchronization ownership.', ['Add a concise # @customstate contract.', 'Review escape, KO, round transition, and target-loss behavior.']],
  'cross-entity-write': ['Cross-entity write ordering', 'Writing movement or state through another entity can create same-frame ordering assumptions.', ['Choose one position/state owner.', 'Use a GameTime-stamped handshake for same-frame coordination.', 'Test both player orderings and team modes.']],
  'forced-order': ['Forced processing order', 'runFirst or runLast changes normal player ordering and can conceal an ownership problem.', ['Keep it only for a documented global contract.', 'Test without the flag to expose hidden synchronization assumptions.']],
  'loop-progress': ['Loop progress', 'The analyzer cannot see a condition update or reachable break, so the loop may run until the engine cap.', ['Update a value used by the condition.', 'Add a reachable break and a deliberate upper bound.', 'Confirm the loop cannot repeat expensive redirected queries unnecessarily.']],
  'loop-redirect': ['Redirect inside loop', 'Entity enumeration or redirect validity can change and should not be treated as a stable collection.', ['Revalidate the redirect inside the loop.', 'Avoid depending on allocation or processing order.']],
  'map-prefix': ['Project map namespace', 'The map name does not match the configured optional project namespaces.', ['Confirm the map belongs to this project/module.', 'Add or change an allowed prefix only after project review.', 'Disable prefix warnings when the project intentionally has no convention.']],
  'function-prefix': ['Project function namespace', 'The function name does not match the configured optional project namespaces.', ['Confirm ownership and collision risk.', 'Use a configured prefix when sharing modules across characters.', 'Do not rename native IkSys_ functions.']],
  'first-active-element-mismatch': ['First active element mismatch', 'The ZSS timing constant and the AIR action disagree about when Clsn1 first becomes active.', ['Review the AIR element sequence and durations.', 'Update the owning constant or animation intentionally.', 'Retest hit timing after either change.']],
  'idle-element-mismatch': ['Idle element mismatch', 'A timing declaration and the AIR action disagree about the expected non-active element boundary.', ['Review AIR durations and loops.', 'Confirm whether the code or animation is authoritative.', 'Retest recovery and cancel timing.']],
  'air-missing-sff-sprite': ['AIR frame uses a missing sprite', 'This animation element refers to a group,index that is absent from the character SFF, so the character will not draw for the element’s duration.', ['Open the AIR and SFF workspaces together.', 'Restore or correctly renumber the intended sprite, or deliberately replace the AIR reference.', 'Retest every state that uses the repaired action.']],
  'air-runtime-missing-sff-sprite': ['Runtime AIR action uses a missing sprite', 'A literal animation reference was found in the character code, or the action is recommended by the selected standard. Its AIR contains one or more sprites absent from the assigned SFF.', ['Open the reported AIR action and its calling code together.', 'Confirm the branch can still execute for the supported roster.', 'Restore the sprite, update the AIR, or deliberately retire the calling branch.']],
  'air-legacy-missing-sff-sprite': ['Retained legacy AIR uses removed sprites', 'The AIR action is not a required animation and no literal runtime animation reference was found. This is informational because projects may intentionally keep old AIR while removing unused SFF sprites.', ['Enable this optional diagnostic only when auditing retained legacy AIR.', 'Use ; IKEMAKER: ARCHIVED or ; @archive immediately before an action to identify intentional archival material.', 'Do not restore or replace sprites unless runtime use is confirmed.']],
  'air-sff-missing-summary': ['AIR and SFF are out of sync', 'One or more AIR elements refer to sprites that are not present in the assigned SFF.', ['Use the Animation Repair character session.', 'Prioritize required movement and get-hit actions before unused or archived actions.', 'Do not invent replacement sprites for ambiguous references.']],
  'missing-function': ['Missing authored function', 'A project-owned function call has no declaration in the indexed ZSS workspace.', ['Check spelling and configured function namespace.', 'Confirm the owning ZSS file is referenced by the character DEF.', 'Do not create a placeholder function without understanding its contract.']],
  'function-arity': ['Function argument count', 'The call supplies a different number of arguments than the indexed declaration.', ['Compare the call with the declaration signature.', 'Update the caller or function contract deliberately.', 'Review every other reference before changing a shared function.']],
  'function-order': ['ZSS function order', 'ZSS functions can call only functions defined earlier in the loaded source order.', ['Move the dependency before the caller or reorganize module loading.', 'Keep the resulting order readable and cycle-free.']],
  'duplicate-function': ['Duplicate function declaration', 'The same owned function name is declared more than once in the file.', ['Choose one authoritative declaration.', 'Rename only when the functions truly have different contracts.', 'Use Find All References before resolving the duplicate.']]
});

function explanationFor(code) { return EXPLANATIONS[String(code || '')] || null; }

function explanationMarkdown(code, diagnosticMessage = '') {
  const entry = explanationFor(code);
  if (!entry) return '';
  const [title, meaning, steps] = entry;
  return [`# ${title}`, '', `Diagnostic code: \`${code}\``, '', diagnosticMessage ? `Reported: ${diagnosticMessage}` : '', diagnosticMessage ? '' : '', '## What it means', '', meaning, '', '## Review steps', '', ...steps.map((step) => `- ${step}`), '', 'This explanation is advisory and does not modify the project. Confirm the result in IKEMEN 1.0.'].filter((line, index, lines) => !(line === '' && lines[index - 1] === '')).join('\n');
}

function registerDiagnosticExplanations(vscode, context) {
  const command = 'zss.explainDiagnostic';
  context.subscriptions.push(
    vscode.commands.registerCommand(command, async (code, message) => {
      const content = explanationMarkdown(code, message);
      if (!content) return vscode.window.showInformationMessage(`No bundled explanation is available for ${code || 'this diagnostic'}.`);
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
      await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }),
    vscode.languages.registerCodeActionsProvider({ language: 'zss', scheme: 'file' }, {
      provideCodeActions(_document, _range, contextValue) {
        return (contextValue.diagnostics || []).filter((diagnostic) => explanationFor(diagnostic.code)).map((diagnostic) => {
          const action = new vscode.CodeAction(`Explain IKEMEN diagnostic: ${diagnostic.code}`, vscode.CodeActionKind.QuickFix);
          action.diagnostics = [diagnostic];
          action.command = { command, title: action.title, arguments: [diagnostic.code, diagnostic.message] };
          return action;
        });
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })
  );
}

module.exports = { EXPLANATIONS, explanationFor, explanationMarkdown, registerDiagnosticExplanations };
