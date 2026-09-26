# Publishing IKEMaker beta updates

Public distribution repository: `JustNoPoint/ikemaker`.

The updater reads the explicit beta manifest at `updates/beta.json` from the
repository's `main` branch. It does not use GitHub's mutable “latest” endpoint.

## Safe publication order

1. Build and review a new immutable VSIX and both tester ZIPs. Never overwrite a
   historical release artifact.
2. Verify the nested ZIP/VSIX inventories include every required helper/runtime,
   offline documentation, installer, Lua Language Server VSIX, license, beta notes,
   and checksums. Confirm no project/game/private paths or credentials are present.
3. Create a versioned GitHub release and upload the reviewed artifacts.
4. Confirm each uploaded asset is downloadable at its final immutable URL.
5. Generate `updates/beta.json` with `tools/create-extension-update-feed.ps1`, using
   the exact uploaded VSIX URL. The generator records version, channel, editor
   compatibility, byte size, SHA-256, and release notes.
6. Review the generated manifest and commit it only after the asset exists. This
   feed promotion is what makes the beta available to subscribed installations.

No publisher credentials belong in source, packages, or the manifest. A failed
upload must leave the existing feed unchanged. The website can later link to the
GitHub release, but it is not part of the initial trust path.

## Tester behavior

IKEMaker checks at most at the configured interval and can be disabled. A discovered
release shows its notes, size, and hash. Download/install requires explicit approval.
The VSIX is staged in VS Code's IKEMaker global storage, verified, and passed to the
normal VS Code extension installer. The current and one previous verified VSIX are
retained there; game and project folders are never used.
