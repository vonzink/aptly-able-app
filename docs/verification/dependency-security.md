# Dependency security hardening — September 15, 2026

Local-only changes. No app, server or website was deployed.

## Findings and changes

The production dependency audit reported two moderate advisories, no high/critical advisories. Both were traced to actual installed consumers before changing resolution.

| Advisory                                                                                                              | Installed consumer                                            | Change and compatibility                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [GHSA-vcc3-ghjq-m6fr](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr) | Expo Router → query-string 7.1.3 → decode-uri-component 0.2.2 | Parent-scoped override to the maintainer’s 0.5.0 single-pass decoder. query-string remains 7.1.3; a one-line pnpm patch reads the new ES module’s default export while preserving query-string’s existing CommonJS API.        |
| [GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/releases/tag/v11.1.1)                                            | Expo config plugins → xcode 3.0.1 → uuid 7.0.3                | Parent-scoped override to 11.1.1, the patched release that still provides CommonJS exports. xcode uses `uuid.v4()` without an output buffer; the advisory’s affected v3/v5/v6 buffer calls were not observed in this consumer. |

The URL decoder matters to untrusted incoming links. A bounded regression process reproduced the old decoder’s stall on repeated invalid percent bytes; the updated router parser completes the same input. This is a local dependency-level reproduction, not a remote test or physical phone benchmark.

The upstream decoder release is documented at [v0.5.0](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0). `pnpm-workspace.yaml` scopes overrides to the inspected parent versions, and `patches/query-string@7.1.3.patch` is applied through the lockfile. Do not copy changes directly into installed node_modules or suppress audit findings. When Expo Router adopts a fixed compatible query-string/decoder upstream, remove the override and patch together and rerun the tests. An xcode dependency update should likewise replace its temporary UUID override.

## Verification

- Before the fix: malformed-link regression exceeded its two-second process limit; UUID dependency assertion identified 7.0.3.
- After the fix: all three dependency regressions passed. Enrollment token punctuation, Unicode/space/plus handling, repeated query keys and fragments were preserved; 100 generated Xcode IDs were unique valid 24-character IDs.
- `pnpm audit --prod`: no known vulnerabilities reported after the locked changes. This is a registry-advisory snapshot, not proof of overall app/backend security or App Store approval.
- `pnpm check` now includes `test:release` (privacy/distribution and dependency regressions). The real plist packaging fixture is macOS-only; other checks can run on non-macOS hosts.
- Post-fix production iOS, Android and web bundle exports completed. Expo store-config introspection also completed with the patched Xcode dependency.
- Re-run `pnpm audit:dependencies` before publishing. It is separate from offline code checks because it depends on current registry data.

Native compilation and device behavior still require the release checklist. SDK privacy declarations and vendor-retention evidence are separate from npm vulnerability scanning.
