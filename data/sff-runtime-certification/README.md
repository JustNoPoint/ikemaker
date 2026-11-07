# Bundled SFF runtime evidence

`windows-x64-v21` is an exact copy of the genuine compact evidence from `data/qa/sff-windows-certification-2026-11-04/v5-compact`: manifest, observed result ledger and66 individually hashed evidence artifacts. It contains no executable. No runtime depends on the original QA or TEMP directory.

`src/sff_bundled_certification.js` resolves this extension-relative resource, pins both manifest and observed ledger, and reruns the normal evidence intake on every use. It supports only actual Windows x64 with the exact native v2.1 backend. Missing or changed resources refuse. The existing reviewed production lifecycle still controls adoption. Linux remains unverified under the user's explicit deferral; this bundle cannot authorize a Linux host.

The original physical run used official nightly6e564af055bb1341b787990f971828ff930935b4. Full raw captures, historical failures, provenance and the independent analysis remain in the QA directory. The compact per-check artifacts embed actual PNGs once and resolve every related transparency/link reference internally by evidence ID and image hash.
