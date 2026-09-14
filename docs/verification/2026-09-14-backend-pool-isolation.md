# Backend pool-isolation deployment — September 14, 2026

## Result and scope

Deployed at 23:40 UTC to `https://api.plaud.aptlyable.info` on EC2
`i-066c05c21f8aa2665`, `us-east-2`. The API container is healthy. The deployment
closes the source-versus-live gap for code audit C2.

The previous image shared two database connections between ordinary requests,
Plaud device operations and transcription. The new image uses independent pools
with maximum sizes 2, 2 and 1. Ownership locks remain intact; this does not add
durable vendor reconciliation or guarantee capacity under arbitrary load.

Comparing the deployed source with the release input found exactly two backend
source differences: `apps/api/src/infrastructure/database.ts` and
`apps/api/src/bootstrap/server.ts`. Contracts, backend package manifests and
configuration were unchanged. The lockfile difference removes unused mobile
dependencies; it does not change backend dependencies.

## Release identity

- Source commit: `9ec1539685a43d1c8770c11523d42179e2a86b88`.
- Image: `aptly-able-pilot-api:20260914-pool-9ec1539`.
- Linux/amd64 manifest:
  `sha256:587d7b83d3bb11cd9ef2a9c57f8e7c36bffd36358e8a91952cb7716ddae8e056`.
- Image config:
  `sha256:bf36a44a16e51ba94c9c3228e508685f1418eded20830e3045f84f27beece699`.
- Compressed archive SHA-256:
  `3ed31921176ac11ab54ff3b051e59ca5abbfc597bf3bef714f7508cc7a8f3b5c`.
- Release directory:
  `/opt/aptly-able-pilot/releases/20260914T225356Z-pool-9ec1539`.
- `current` points to that directory; private `.env` remains mode 600.

The image was built on the Mac from a selective `git archive`, using the existing
Dockerfile, frozen lockfile, Node 24.13.0 and pnpm 11.19.0. Contract and API
TypeScript builds passed. Archive checksums matched after upload; loaded image
layers, configuration, architecture and source-revision label matched the build.
Docker's local index, platform manifest and image-config digests are distinct;
the Linux manifest above identifies the running server image.

## Preservation and release checks

- Captured a fresh custom-format Postgres backup immediately before activation,
  including the recovered recorder identity and assignment. `pg_restore --list`
  succeeded, and the server and private local copies have matching SHA-256.
  This verifies archive readability, not a full restore rehearsal.
- Reused the existing Compose files. Effective API configuration was identical
  except for the image and build-context path. Database configuration, networks,
  volumes, credentials and resource limits were preserved.
- Replaced only the API with `up -d --no-deps --no-build --pull never --wait`.
  No migration ran. Postgres and Vaultwarden retained their exact container IDs,
  image IDs, start times and mounts; both remained healthy.
- API HTTPS readiness, pilot-only auth configuration, authenticated session,
  owner assignment list and original enrollment operation all passed. The
  recovered active NotePin S ending 5641 remained accessible.
- A separate diagnostic process used the deployed database/identity/query modules
  and held both device-pool connections and the worker-pool connection. Ordinary
  database readiness, session verification and assignment reads completed in
  14 ms. All clients were released and all diagnostic pools closed. The temporary
  diagnostic session was deleted afterward; existing sessions were preserved.
- No Plaud bind/unbind or other vendor request was made by these release probes.
  Broad regression suites, concurrent physical pairing and hardware transfer
  acceptance were not rerun. Earlier C2 regression evidence is in the reliability
  report; the diagnostic is not a production load test.
- Caddy's configuration checksum was unchanged. Vaultwarden HTTPS and the API
  remained available. The Android APK endpoint returned HTTP 200 with the
  expected APK content type and 53,578,526-byte content length.

No mobile reinstall, Amplify publication or DNS change was needed. A temporary
SSH rule for the user's current `/32` address was explicitly approved because
that address was absent from the existing allowlist. After verification, the
rule was revoked, AWS showed the original four inbound rule IDs, and the local
SSH control connection was closed. No permanent access expansion remains.

## Backup and private evidence

Latest pre-activation backup:
`/opt/aptly-able-pilot/backups/pilot-before-activation-20260914T234014Z.dump`.

SHA-256: `c2044df21289c507f1f1fcaf8bb57c7312443b4c8a773be3935e74f173139bdb`.

Ignored local evidence directory: `.local/backend-release/20260914T225356Z/`.
It contains the build log, source/image archives, release metadata, source
comparison, container snapshots, backups, activation/verification results,
private Compose snapshots and temporary-rule cleanup record. Keep the backups
and effective configuration private; neither is part of Git or the website.

## Rollback

The prior release `/opt/aptly-able-pilot/releases/2026-09-14-1805` and image
`aptly-able-pilot-api:2026-09-14-amd64` remain on the server. For this release,
rollback needs no database restoration or schema reversal. Reassess subsequent
releases before using these commands. Connect from an already authorized network.

```sh
cd /opt/aptly-able-pilot/releases/2026-09-14-1805/deploy/pilot
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml up -d --no-deps --no-build --pull never --wait --wait-timeout 60 api
curl --fail https://api.plaud.aptlyable.info/health/ready
ln -s /opt/aptly-able-pilot/releases/2026-09-14-1805 /opt/aptly-able-pilot/current-rollback
mv -Tf /opt/aptly-able-pilot/current-rollback /opt/aptly-able-pilot/current
```

This intentionally restores the old shared-pool behavior. Do not stop the database,
remove volumes or restore an old database dump for an ordinary API rollback.
