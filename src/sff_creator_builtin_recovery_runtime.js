'use strict';
const fs = require('fs');
const crypto = require('crypto');
const {
    hashCanonical
} = require('./sff_capability_report');
const {
    deriveRestartInput
} = require('./sff_creator_startup_execution_attempt_router');
const {
    readCreatorHistoricalExecutionResultRestartAuthority
} = require('./sff_creator_saved_execution_result_verifier');
const {
    createCreatorRestartRecoveryPlan
} = require('./sff_creator_restart_recovery_plan');
const {
    CONFIRMATION_KEYS,
    approveCreatorRestartRecoveryPlan
} = require('./sff_creator_restart_recovery_approval');
const {
    executeCreatorRestartRecovery,
    resumeCreatorRestartRecovery
} = require('./sff_creator_restart_recovery_executor');
const {
    createCreatorRecoveryHistoryReconciliationPlan
} = require('./sff_creator_recovery_history_reconciliation_plan');
const {
    packHistoryInput
} = require('./sff_creator_recovery_history_input');
const APPROVED = 'builtin-runtime-recovery-approved-manifest';
const TERMINAL = 'builtin-runtime-recovery-terminal-manifest';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
const base = l => ({
    operationDirectory: l.operationDirectory,
    expectedOperationId: l.expectedOperationId,
    expectedLatestCheckpointHash: l.expectedLatestCheckpointHash,
    expectedVaultRoot: l.expectedVaultRoot
});
const encode = value => Buffer.isBuffer(value) ? {
    $recoveryBytes: value.toString('base64')
} : Array.isArray(value) ? value.map(encode) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) : value;
const decode = value => value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.$recoveryBytes === 'string' ? Buffer.from(value.$recoveryBytes, 'base64') : Array.isArray(value) ? value.map(decode) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)])) : value;

function artifact(name, value) {
    const content = Buffer.isBuffer(value) ? value : bytes(value);
    return {
        name,
        bytes: content,
        expectedByteHash: sha(content),
        authorityHash: hashCanonical({
            domain: 'ikemaker.builtin-recovery-retained',
            name,
            byteHash: sha(content)
        })
    };
}

function createRecoveryRuntime(api) {
    function read(l) {
        const snapshot = api.readSnapshot(base(l)),
            row = snapshot.authority.artifacts.find(row => row.name === l.manifestArtifactName);
        if (!row || row.byteHash !== l.expectedManifestArtifactByteHash || row.authorityHash !== l.expectedManifestAuthorityHash) throw Error('Recovery locator artifact drifted.');
        const m = JSON.parse(snapshot.readArtifactBytes(row.name)),
            core = {
                ...m
            };
        delete core.manifestHash;
        if (m.parentHeadRecordHash !== snapshot.authority.headCheckpoint.previousCheckpointHash || m.operationId !== l.expectedOperationId || m.manifestHash !== l.expectedManifestHash || hashCanonical(core) !== m.manifestHash) throw Error('Recovery manifest authority drifted.');
        return {
            snapshot,
            manifest: m
        };
    }

    function append(l, name, core, extra = [], binaries = [], state = 'RestartRecoveryRequired') {
        const snapshot = api.readSnapshot(base(l)),
            a = snapshot.authority,
            manifest = {
                ...core,
                operationId: a.operationId,
                parentHeadRecordHash: a.semanticHeadRecordHash
            };
        manifest.manifestHash = hashCanonical(manifest);
        const added = [...extra, artifact(name, manifest)],
            allArtifacts = [...a.artifacts.map(row => ({
                name: row.name,
                bytes: snapshot.readArtifactBytes(row.name),
                expectedByteHash: row.byteHash,
                authorityHash: row.authorityHash
            })), ...added];
        const allBinaries = [...a.binaries.map(row => ({
            name: row.name,
            bytes: snapshot.readBinaryBytes(row.name),
            expectedByteHash: row.byteHash,
            authorityHash: row.authorityHash
        })), ...binaries];
        const authorities = [...a.artifactAuthorities, ...added.map(row => ({
            name: row.name,
            hash: row.authorityHash
        })), ...binaries.map(row => ({
            name: row.name,
            hash: row.authorityHash
        }))];
        const result = api.appendVault({
            vaultRoot: a.vaultRootSeal.path,
            workspaceRoot: a.workspaceRootSeal.path,
            workspaceId: a.workspaceId,
            operationId: a.operationId,
            targetId: a.targetId,
            backendId: a.backendId,
            adapterId: a.adapterId,
            activePath: a.activePath,
            candidatePath: a.candidatePath,
            historyRoot: a.historyRoot,
            lifecycleState: state,
            terminalHistoryEvidence: null,
            artifactAuthorities: authorities,
            artifacts: allArtifacts,
            binaries: allBinaries,
            operationDirectory: a.operationDirectory,
            expectedPreviousCheckpointHash: a.semanticHeadRecordHash,
            mutationId: hashCanonical({
                domain: 'ikemaker.builtin-recovery-append',
                parent: a.semanticHeadRecordHash,
                manifestHash: manifest.manifestHash
            })
        });
        const root = added.at(-1);
        return {
            operationDirectory: l.operationDirectory,
            expectedVaultRoot: l.expectedVaultRoot,
            expectedOperationId: l.expectedOperationId,
            expectedLatestCheckpointHash: result.latestCheckpointHash,
            manifestArtifactName: name,
            expectedManifestArtifactByteHash: root.expectedByteHash,
            expectedManifestHash: manifest.manifestHash,
            expectedManifestAuthorityHash: root.authorityHash
        };
    }

    function source(l) {
        const classified = api.readClassification(l);
        if (classified.classification !== 'RestartRecoveryRequired') throw Error('A retained recovery classification is required.');
        const snapshot = api.readSnapshot(base(l)),
            m = JSON.parse(snapshot.readArtifactBytes('result-classification-route-manifest'));
        const resultLocator = {
            ...l,
            expectedLatestCheckpointHash: m.parentHeadRecordHash,
            manifestArtifactName: m.parentManifestArtifactName,
            expectedManifestArtifactByteHash: m.parentManifestArtifactByteHash,
            expectedManifestHash: m.parentManifestHash,
            expectedManifestAuthorityHash: m.parentManifestAuthorityHash
        };
        const saved = readCreatorHistoricalExecutionResultRestartAuthority(l, resultLocator),
            held = saved.copyRestartAuthority();
        return {
            input: deriveRestartInput({
                executionLayoutApprovalInput: {},
                executionLayoutApprovalReceiptArtifactBytes: held.executionLayoutApprovalReceiptArtifactBytes,
                ...held.expectedHashes
            }),
            layoutInput: saved.copyExecutionLayoutApprovalInput()
        };
    }
    async function beginRecoveryReview({
        continuationLocator: l
    }, ui) {
        const held = api.recoverySource ? api.recoverySource(l) : source(l),
            plan = createCreatorRestartRecoveryPlan(held.input, {completedVaultRoot:l.expectedVaultRoot}),
            action = 'cleanup-verified-terminal-artifacts';
        if (plan.blockers.length || plan.allowedActions.length !== 1 || plan.allowedActions[0] !== action) throw Error('This recovery route supports verified terminal cleanup only; preserve this operation for explicit manual recovery.');
        const summary = {
            action,
            active: plan.active,
            candidate: plan.candidate,
            artifacts: plan.currentStateSeal.rows,
            completedArtifactExclusions: plan.currentStateSeal.completedArtifactExclusions || [],
            cleanupPaths: plan.currentStateSeal.rows.filter(row => row.exists && ({replacementTemp:'candidate',rollbackHold:'old-active',failedInstallHold:'candidate',rollbackTemp:'old-active',backupPartial:'old-active'})[row.name] === row.authority && ['old-active-recognized','candidate-validated'].includes(row.formatStatus)).map(row => row.path),
            risks: plan.risks,
            planHash: plan.planHash
        };
        const ids = [...CONFIRMATION_KEYS, ...plan.risks.map(id => 'risk:' + id)];
        for (let i = 0; i < ids.length; i++)
            if (await ui.confirmReviewRow({
                    stage: 'restart-recovery',
                    id: ids[i],
                    label: require('./sff_creator_layout_review_ui').labelFor(ids[i]),
                    summary,
                    position: i + 1,
                    total: ids.length
                }) !== true) return {
                status: 'review-deferred',
                continuationLocator: l,
                resetDraft: false,
                writesAllowed: false
            };
        const active = plan.currentStateSeal.rows.find(row => row.name === 'active');
        const decision = {
            status: 'approved',
            operationId: plan.operationId,
            recoveryPlanHash: plan.planHash,
            currentStateHash: plan.currentStateHash,
            executionLayoutApprovalReceiptHash: plan.executionLayoutApprovalReceiptHash,
            classification: plan.classification,
            selectedAction: action,
            selectedTerminalState: plan.allowedActionStateMapping[action],
            lastJournalState: plan.currentStateSeal.lastJournalState,
            lastJournalHash: plan.currentStateSeal.lastJournalHash,
            journalChainHash: plan.currentStateSeal.journalChainHash,
            recoveryStateMachineHash: plan.recoveryStateMachineHash,
            blockerCount: 0,
            source: {
                role: 'none',
                path: null,
                identity: null,
                byteHash: null,
                byteLength: null,
                authority: null,
                formatStatus: null
            },
            destination: {
                activePath: plan.active.path,
                activeRealpath: plan.active.realpath,
                activeDirectoryIdentity: plan.currentStateSeal.activeDirectory.identity,
                activeDirectoryDevice: plan.currentStateSeal.activeDirectory.device,
                expectedBeforeAuthority: active.authority,
                expectedBeforeByteHash: active.byteHash,
                expectedBeforeByteLength: active.byteLength,
                expectedAfterAuthority: active.authority,
                expectedAfterByteHash: plan.active.byteHash,
                expectedAfterByteLength: plan.active.byteLength
            },
            cleanupArtifacts: ['backup', 'backupPartial', 'failedInstallHold', 'lease', 'replacementTemp', 'rollbackHold', 'rollbackTemp'].map(name => plan.currentStateSeal.rows.find(row => row.name === name)).filter(row => row?.exists === true).map(row => ({
                name: row.name,
                path: row.path,
                identity: row.identity,
                byteHash: row.byteHash,
                byteLength: row.byteLength,
                authority: row.authority,
                disposition: ({
                    replacementTemp: 'candidate',
                    rollbackHold: 'old-active',
                    failedInstallHold: 'candidate',
                    rollbackTemp: 'old-active',
                    backupPartial: 'old-active'
                })[row.name] === row.authority && ['old-active-recognized', 'candidate-validated'].includes(row.formatStatus) ? 'remove-after-terminal' : 'retain'
            })).sort((a, b) => a.name.localeCompare(b.name)),
            recoveryPaths: plan.recoveryPaths,
            acknowledgedRiskIds: plan.risks,
            confirmations: Object.fromEntries(CONFIRMATION_KEYS.map(id => [id, true]))
        };
        const planBytes = bytes(plan),
            approvalInput = {
                restartRecoveryPlanInput: held.input,
                restartRecoveryPlanArtifactBytes: planBytes,
                expectedRecoveryPlanArtifactByteHash: sha(planBytes),
                expectedRecoveryPlanHash: plan.planHash,
                expectedCurrentStateHash: plan.currentStateHash,
                expectedExecutionLayoutApprovalReceiptHash: plan.executionLayoutApprovalReceiptHash,
                expectedOperationId: plan.operationId,
                expectedJournalChainHash: plan.currentStateSeal.journalChainHash,
                expectedLastJournalHash: plan.currentStateSeal.lastJournalHash,
                expectedRecoveryStateMachineHash: plan.recoveryStateMachineHash,
                approvalDecision: decision
            };
        const approved = approveCreatorRestartRecoveryPlan(approvalInput),
            receiptBytes = bytes(approved.receipt),
            r = approved.receipt;
        const executionInput = {
            restartRecoveryApprovalInput: approvalInput,
            restartRecoveryApprovalReceiptArtifactBytes: receiptBytes,
            expectedRecoveryApprovalReceiptArtifactByteHash: sha(receiptBytes),
            expectedRecoveryApprovalReceiptHash: approved.receiptHash,
            expectedApprovalDecisionHash: r.approvalDecisionHash,
            expectedRecoveryPlanArtifactByteHash: r.restartRecoveryPlanArtifactByteHash,
            expectedRecoveryPlanHash: r.approvedRestartRecoveryPlanHash,
            expectedCurrentStateHash: r.currentStateHash,
            expectedExecutionLayoutApprovalReceiptHash: r.executionLayoutApprovalReceiptHash,
            expectedOperationId: r.operationId,
            expectedJournalChainHash: r.journalChainHash,
            expectedLastJournalHash: r.lastJournalHash,
            expectedRecoveryStateMachineHash: r.recoveryStateMachineHash
        };
        const next = append(l, APPROVED, {
            schema: 'ikemaker.sff-creator-builtin-runtime-recovery-approved',
            version: 1,
            executorOperationId: plan.operationId,
            executionInput: encode(executionInput),
            layoutInput: encode(held.layoutInput)
        });
        return {
            status: 'restart-recovery-approved-execution-required',
            continuationLocator: next,
            resetDraft: false,
            writesAllowed: false
        };
    }

    function executeApprovedRecovery({
        continuationLocator: l
    }) {
        const {
            snapshot,
            manifest: m
        } = read(l);
        if (l.manifestArtifactName !== APPROVED) throw Error('An exact retained recovery approval is required.');
        const input = decode(m.executionInput),
            r = JSON.parse(input.restartRecoveryApprovalReceiptArtifactBytes),
            resumeInput = {
                ...input
            };
        delete resumeInput.restartRecoveryApprovalInput;
        const started = fs.existsSync(r.recoveryPaths.capsulePath) || Object.values(r.recoveryPaths.journalPaths).some(filename => fs.existsSync(filename));
        const receipt = started ? resumeCreatorRestartRecovery(resumeInput) : executeCreatorRestartRecovery(input);
        if (receipt.terminalState !== 'recovery_complete') throw Error('Recovery did not reach its verified terminal state; keep the retained approval and inspect recovery evidence.');
        const receiptBytes = bytes(receipt),
            journals = receipt.journalRecords.map(row => {
                const content = fs.readFileSync(row.path),
                    value = JSON.parse(content);
                return {
                    state: row.state,
                    path: row.path,
                    artifactBytes: content,
                    artifactByteHash: sha(content),
                    recordHash: value.recordHash
                };
            }),
            full = journals.map(row => ({
                ...JSON.parse(row.artifactBytes),
                fileByteHash: row.artifactByteHash,
                path: row.path
            })),
            a = snapshot.authority;
        const historyPlanInput = {
            schema: 'ikemaker.sff-creator-recovery-history-reconciliation-input',
            version: 1,
            executionLayoutApprovalInput: decode(m.layoutInput),
            restartRecoveryApprovalInput: input.restartRecoveryApprovalInput,
            restartRecoveryApprovalReceiptArtifactBytes: input.restartRecoveryApprovalReceiptArtifactBytes,
            expectedRecoveryApprovalReceiptArtifactByteHash: input.expectedRecoveryApprovalReceiptArtifactByteHash,
            expectedRecoveryApprovalReceiptHash: input.expectedRecoveryApprovalReceiptHash,
            recoveryReceiptArtifactBytes: receiptBytes,
            expectedRecoveryReceiptArtifactByteHash: sha(receiptBytes),
            expectedRecoveryReceiptHash: hashCanonical(receipt),
            recoveryJournalArtifacts: journals,
            expectedRecoveryPlanHash: r.approvedRestartRecoveryPlanHash,
            expectedCurrentStateHash: r.currentStateHash,
            expectedRecoveryStateMachineHash: r.recoveryStateMachineHash,
            expectedRecoveryJournalChainHash: hashCanonical(full),
            expectedRecoveryLastJournalHash: full.at(-1).recordHash,
            expectedOperationId: r.operationId,
            expectedExecutionLayoutApprovalReceiptHash: r.executionLayoutApprovalReceiptHash,
            expectedHistoryRoot: {
                path: a.historyRootSeal.path,
                realpath: a.historyRootSeal.realpath,
                identity: a.historyRootSeal.identity,
                device: a.historyRootSeal.device
            },
            failureRetainedAuthority: null
        };
        const plan = createCreatorRecoveryHistoryReconciliationPlan(historyPlanInput);
        if (plan.blockers?.length) throw Error('Recovery history is blocked: ' + plan.blockers.join(', '));
        const packed = packHistoryInput(historyPlanInput),
            outcome = artifact('sff19c-recovery-outcome-receipt', receiptBytes),
            history = artifact('sff19-history-reconciliation-plan', plan);
        const next = append(l, TERMINAL, {
            schema: 'ikemaker.sff-creator-builtin-runtime-recovery-terminal',
            version: 1,
            executorOperationId: r.operationId,
            recoveryReceiptHash: hashCanonical(receipt),
            recoveryReceiptArtifactName: outcome.name,
            recoveryReceiptArtifactByteHash: outcome.expectedByteHash,
            historyPlanHash: plan.planHash,
            historyPlanArtifactName: history.name,
            historyPlanArtifactByteHash: history.expectedByteHash
        }, [outcome, history, packed.artifact], packed.binaries, 'TerminalNeedsHistory');
        return {
            status: 'recovery-history-review-required',
            continuationLocator: next,
            resetDraft: false,
            writesAllowed: false
        };
    }
    return {
        beginRecoveryReview,
        executeApprovedRecovery,
        readApprovedRecovery: l => {
            const {manifest} = read(l);
            if (l.manifestArtifactName !== APPROVED || manifest.schema !== 'ikemaker.sff-creator-builtin-runtime-recovery-approved' || manifest.version !== 1) throw Error('Recovery approval root drifted.');
            const input = decode(manifest.executionInput);
            const saved = require('./sff_creator_restart_recovery_approval').verifySavedCreatorRestartRecoveryApproval(input.restartRecoveryApprovalInput);
            if (saved.receipt.operationId !== manifest.executorOperationId || saved.receiptHash !== input.expectedRecoveryApprovalReceiptHash || sha(input.restartRecoveryApprovalReceiptArtifactBytes) !== input.expectedRecoveryApprovalReceiptArtifactByteHash || hashCanonical(JSON.parse(input.restartRecoveryApprovalReceiptArtifactBytes)) !== saved.receiptHash) throw Error('Retained recovery approval receipt drifted.');
            return {
                status: 'restart-recovery-approved-execution-required',
                operationId: manifest.operationId,
                lifecycleState: 'RestartRecoveryRequired',
                continuationLocator: l,
                resetDraft: false,
                writesAllowed: false
            };
        }
    };
}
module.exports = {
    APPROVED,
    TERMINAL,
    createRecoveryRuntime
};
