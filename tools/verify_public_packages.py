"""Verify the immutable Windows tester set before promoting the beta feed."""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path
from zipfile import ZipFile

LUALS = "c0a7489ad58358ddf2590f6782c94fa9308076b73aaa30b456932373b0d8cb28"
WORKSTATION = re.compile(rb"[A-Z]:[\\/]+(?:Users[\\/]+(?!Public[\\/]|Default[\\/])|Dropbox[\\/]+)", re.I)
SECRET = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}")
ROOT = Path(__file__).resolve().parent.parent


def require(ok, problem):
    if not ok:
        raise ValueError(problem)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked_names(archive):
    names = archive.namelist()
    require(len({n.casefold() for n in names}) == len(names), "Duplicate archive entry")
    require(not any(n.startswith(("/", "\\")) or "\\" in n or ".." in n.split("/") for n in names), "Unexpected archive path")
    require(archive.testzip() is None, "Archive integrity check failed")
    return set(names)


def scan(name, contents):
    for pattern in (WORKSTATION, SECRET):
        require(not pattern.search(contents) and not pattern.search(contents.replace(b"\x00", b"")), f"Private data marker in {name}")


def verify_payload(file, version):
    with ZipFile(file) as archive:
        names = checked_names(archive)
        required = ["air-language-configuration.json", "package.json", "LICENSE.txt", "THIRD-PARTY-NOTICES.md", "src/extension.js",
                    "src/web_extension.js", "data/offline-docs/reference/manifest.json",
                    "data/sff-runtime-certification/windows-x64-v21/ledger.json",
                    "bin/win32-x64/sprmake2.exe", "bin/win32-x64/sndmaker.exe", "bin/win32-x64/sff2png.exe",
                    "companions/IKeMeter/Start-IKeMeter.ps1"]
        require(all("extension/" + f in names for f in required), "Missing release component")
        require(json.loads(archive.read("extension/package.json"))["version"] == version and
                f'Version="{version}"'.encode() in archive.read("extension.vsixmanifest"), "Incorrect VSIX version")
        # Confirm the semantic (reduced) runtime integrity inventory separately.
        base = "extension/companions/IKeMeter/"
        sums = archive.read(base + "SHA256SUMS.txt").decode().splitlines()
        meter = {base + "SHA256SUMS.txt"}
        for line in sums:
            digest, name = line.split("  ", 1)
            require(sha(archive.read(base + name)) == digest, f"Meter checksum mismatch: {name}")
            meter.add(base + name)
        require(meter == {n for n in names if n.startswith(base)}, "Unmanifested Meter content")
        for n in names:
            require(not re.search(r"/(?:qa|fixtures|probes|test|tests|\.git|node_modules)/|\.(?:sff|snd|vsix|log)$", n, re.I), f"Test or game material: {n}")
            b = archive.read(n)
            scan(n, b)
            if n.startswith("extension/") and n != base + "SHA256SUMS.txt":
                source = ROOT / ("LICENSE" if n == "extension/LICENSE.txt" else n.removeprefix("extension/"))
                require(source.is_file() and b == source.read_bytes(), f"Stale packaged source: {n}")
        return len(names)


def verify_wrapper(file, primary, include_lua, online, version):
    with ZipFile(file) as archive:
        names = checked_names(archive)
        expected = {"IKEMEN-Creator-Tools.vsix", "SHA256SUMS.txt", "README-FIRST.txt", "BETA-NOTES.txt",
                    "BETA-TEST-CHECKLIST.txt", "BETA-TEST-REPORT.txt", "PREVIEW-STATUS.md",
                    "THIRD-PARTY-NOTICES.md", "licenses/IKEMaker-LICENSE.txt"}
        expected.update({"Install IKEMaker Online.cmd", "Install-IKEMaker-Online.ps1"} if online else {"Install IKEMEN Creator Tools.cmd"})
        hashes = {"IKEMEN-Creator-Tools.vsix": primary}
        if include_lua:
            expected.update({"Lua-Language-Server.vsix", "licenses/Lua-Language-Server-LICENSE.txt"})
            hashes["Lua-Language-Server.vsix"] = LUALS
            with ZipFile(io.BytesIO(archive.read("Lua-Language-Server.vsix"))) as lua:
                require(any("license" in n.lower() for n in lua.namelist()), "No LuaLS license")
        require(names == expected, f"Unexpected wrapper contents in {file.name}: {names ^ expected}")
        recorded = {}
        for line in archive.read("SHA256SUMS.txt").decode().splitlines():
            digest, name = line.split("  ", 1)
            require(name not in recorded, "Duplicate nested checksum")
            recorded[name] = digest.lower()
        require(hashes == recorded, f"Incorrect nested checksum file in {file.name}")
        for n in names:
            b = archive.read(n)
            if n in hashes:
                require(sha(b) == hashes[n], f"Nested package changed: {n}")
            else:
                scan(n, b)
        require(version.encode() in archive.read("BETA-NOTES.txt"), "Wrong beta notes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    directory = parser.parse_args().directory
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8-sig"))["version"]
    vsix = directory / f"ikemen-zss-tools-{version}.vsix"
    count = verify_payload(vsix, version)
    digest = sha(vsix.read_bytes())
    files = [vsix]
    for online, mode in [(False, "Offline"), (True, "Online-Bootstrap")]:
        for include_lua, suffix in [(False, ""), (True, "-With-LuaLS")]:
            wrapper = directory / f"IKEMaker-{version}-Windows-{mode}{suffix}.zip"
            verify_wrapper(wrapper, digest, include_lua, online, version)
            files.append(wrapper)
    receipt = "".join(f"{sha(f.read_bytes())}  {f.name}\n" for f in files)
    print(f"Verified {count} VSIX entries and all four nested installer packages.")
    print(receipt, end="")


if __name__ == "__main__":
    main()
