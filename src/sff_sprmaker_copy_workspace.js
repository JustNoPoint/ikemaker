"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {
  hash,
  transactionalWrite,
  transactionalWriteSet,
  optionsFromConfig,
} = require("./mutation_safety");
async function configure(vscode, previous) {
  const defaults = {
    ...require("./sff_sprmaker_201_copy").DEFAULTS,
    ...previous,
  };
  const flags = [
    ["autoCrop", "Crop transparent borders"],
    ["detectDuplicateSprites", "Link duplicate images"],
    ["detectDuplicatePalettes", "Link duplicate palettes"],
    [
      "discardDuplicatePalettes",
      "Discard duplicate palettes and remap sprites",
    ],
    ["decompressOnLoad", "Decompress on load (TData)"],
  ];
  const selected = await vscode.window.showQuickPick(
    flags.map(([key, label]) => ({ key, label, picked: defaults[key] })),
    {
      title: "SprMaker 2.01 options",
      canPickMany: true,
      placeHolder:
        "Choose optional changes; leave all clear to retain borders and independent data",
    },
  );
  if (selected === undefined) return;
  const result = { ...defaults };
  for (const [key] of flags)
    result[key] = selected.some((item) => item.key === key);
  for (const [key, title, values] of [
    ["compress5", "5-bit image encoding", ["lz5", "rle5", "none"]],
    ["compress8", "8-bit image encoding", ["rle8", "none"]],
    ["compress24", "Truecolor image encoding", ["png32", "png24", "none"]],
    [
      "report",
      "Companion report",
      ["summary", "verbose", "very-verbose", "quiet"],
    ],
  ]) {
    const choice = await vscode.window.showQuickPick(
      [defaults[key], ...values.filter((value) => value !== defaults[key])].map(
        (value) => ({
          label: value,
          description: value === defaults[key] ? "Current preference" : "",
          value,
        }),
      ),
      { title },
    );
    if (!choice) return;
    result[key] = choice.value;
  }
  result.allowAlphaLoss = false;
  if (result.compress24 !== "png32")
    result.allowAlphaLoss =
      (await vscode.window.showWarningMessage(
        "PNG24 and RAW24 remove truecolor alpha.",
        {
          modal: true,
          detail:
            "Transparent pixels become opaque. Continue only if this conversion is intended.",
        },
        "Allow Alpha Removal",
      )) === "Allow Alpha Removal";
  if (result.compress24 !== "png32" && !result.allowAlphaLoss) return;
  return result;
}
async function save({
  vscode,
  archive,
  context,
  options,
  validate = () => {},
}) {
  const filename = archive.filename,
    sourceHash = hash(archive.buffer);
  function assertSource() {
    validate();
    if (hash(fs.readFileSync(filename)) !== sourceHash)
      throw Error(
        "The source SFF changed during compatible-copy review. Reopen it before trying again.",
      );
  }
  assertSource();
  if (options === undefined && vscode.window.showQuickPick) {
    options = await configure(
      vscode,
      context?.globalState?.get("sff.sprmaker201"),
    );
    if (!options) return;
  }
  const result = require("./sff_sprmaker_copy").build(archive, options);
  const target = await vscode.window.showSaveDialog({
    title: "Save SprMaker-compatible copy",
    saveLabel: "Review Compatible Copy",
    defaultUri: vscode.Uri.file(
      path.join(
        path.dirname(filename),
        path.parse(filename).name + "-sprmaker.sff",
      ),
    ),
    filters: { SFF: ["sff"] },
  });
  if (!target) return;
  const output = path.resolve(target.fsPath);
  if (fs.existsSync(output) || output === path.resolve(filename))
    throw Error(
      "Choose a new filename. Compatible copy never replaces an existing archive.",
    );
  const detail = options
    ? [
        result.profile,
        "Source: " + filename,
        "Destination: " + output,
        result.spriteCount + " sprites · " + result.paletteCount + " palettes",
        JSON.stringify(result.options, null, 2),
        result.report || "Quiet: no companion report.",
        result.alphaLoss + " truecolor pixels lose alpha.",
        "SFF v1 conversion is separate. Output is semantically compatible; compressed bytes and report wording may differ from upstream.",
        "The source archive remains unchanged.",
      ].join("\n")
    : [
        result.profile,
        "Source: " + filename,
        "Destination: " + output,
        result.spriteCount + " sprites · " + result.paletteCount + " palettes",
        "Preserve physical order, IDs, dimensions, axes, exact index planes, assigned palettes, independent data and existing image/palette links.",
        "Re-encode every image as uncompressed RAW8. Write a 512-byte SFF 2.0.1.0 header with MUGEN 1.0 compatibility. No cropping or duplicate merging.",
        "This is the supported indexed RAW8 profile, not every SprMaker option or byte-identical output. SFF v1, truecolor, 5-bit depth, short palettes and partial palette alpha are refused.",
        "The active source archive and its viewer remain unchanged.",
      ].join("\n");
  const accepted = await require("./sff_readonly_review").review(vscode, {
    title: "SprMaker Compatible Copy Review",
    content: detail,
    confirm: () =>
      vscode.window.showWarningMessage(
        "Save this reviewed compatible SFF copy?",
        {
          modal: true,
          detail: options
            ? [
                output,
                result.spriteCount +
                  " sprites · " +
                  result.paletteCount +
                  " palettes",
                result.alphaLoss + " truecolor pixels lose alpha.",
                result.report
                  ? "Archive and companion report will be saved together."
                  : "Quiet: no companion report.",
                "Full options and report are in the read-only review.",
              ].join("\n")
            : detail,
        },
        "Save Compatible Copy",
      ),
  });
  if (accepted !== "Save Compatible Copy") return;
  assertSource();
  if (result.report)
    transactionalWriteSet(
      fs,
      [
        [output, result.bytes],
        [
          path.join(path.dirname(output), path.parse(output).name + ".txt"),
          result.report,
        ],
      ],
      optionsFromConfig(vscode, output, "sff-sprmaker-compatible-copy", {
        allowExisting: false,
      }),
    );
  else
    transactionalWrite(
      fs,
      output,
      result.bytes,
      optionsFromConfig(vscode, output, "sff-sprmaker-compatible-copy", {
        allowExisting: false,
      }),
    );
  if (hash(fs.readFileSync(output)) !== hash(result.bytes))
    throw Error("Compatible-copy persisted verification failed.");
  if (options && context?.globalState)
    await context.globalState.update("sff.sprmaker201", {
      ...result.options,
      allowAlphaLoss: false,
    });
  void vscode.window.showInformationMessage(
    "Saved SprMaker-compatible copy: " + output,
  );
  return { ...result, destination: output };
}
module.exports = { save, configure };
