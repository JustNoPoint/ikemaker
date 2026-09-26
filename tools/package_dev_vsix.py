"""Refresh an unpackaged development VSIX from the last verified package."""
from pathlib import Path
import sys
import zipfile


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: package_dev_vsix.py <extension-root> <base.vsix> <output.vsix>")
        return 2
    root, base, output = map(Path, sys.argv[1:])
    with zipfile.ZipFile(base, "r") as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            relative = item.filename.removeprefix("extension/")
            replacement = root / relative if item.filename.startswith("extension/") else None
            data = replacement.read_bytes() if replacement and replacement.is_file() else source.read(item.filename)
            target.writestr(item, data)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
