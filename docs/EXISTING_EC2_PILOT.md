# Add the API to the existing Vaultwarden EC2 host

The user elected to reuse an existing small EC2 instance. **Do not create the
Lightsail instance in the alternative `AWS_PILOT.md` guide.** The website stays on
Amplify at `https://plaud.aptlyable.info`, while the backend uses
`https://api.plaud.aptlyable.info`.

## Before changing the server

Confirm the instance name/IP and SSH access with its owner. Read the existing
Docker/Compose services, ports 80/443, reverse proxy configuration, disk and free
memory. Check whether it has a stable Elastic IP. Identify how Vaultwarden is
backed up and where its persistent files live. Do not stop, upgrade, reconfigure,
or delete Vaultwarden, its database, proxy, network or volumes for this pilot.

The API and Postgres are separate containers/volumes. Build images off-host or
limit build concurrency if the host has little memory. Do not assume spare
capacity from the EC2 instance size alone.

## Prepared shared-host configuration

`deploy/pilot/compose.shared-host.yaml` combines with the main Compose file. It
publishes only the API on `127.0.0.1:4180`, keeps Postgres internal, and prevents the
new Caddy service from starting by default. API memory is capped at 384 MiB and
Postgres at 256 MiB, with CPU limits of 0.75 and 0.5 respectively. The existing HTTPS proxy should route
only the new API hostname to this loopback port. If that proxy runs in a container,
use its established network/upstream pattern instead of assuming container
localhost reaches the host.

Set `SHARED_PROXY_IP` to the actual trusted proxy source IP seen by the API. The
deployment intentionally requires this to be explicit. Preserve the current
proxy's client-IP sanitization behavior and avoid wildcard proxy trust. Check for
conflicts with the prepared `172.30.45.0/24` network before using it.

For initial provisioning, before an API container is running, the sequence is:

```sh
cd /opt/aptly-able-pilot/current/deploy/pilot
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml build api
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml up -d postgres
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml run --rm api node apps/api/dist/bootstrap/migrate.js
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml up -d api
```

For updates, stage an immutable release and take a fresh database backup first.
Do not use `compose run api` alongside the running API: both request the same
static IP. The verified update procedure and migration workaround are recorded
in [the 0.1.2 deployment](verification/2026-09-15-version-0.1.2-deployment.md).
Activate only the API with `up -d --no-deps --no-build --pull never --wait api`;
keep the existing database and Vaultwarden running.

Configure HTTPS for `api.plaud.aptlyable.info` using the existing proxy's certificate
workflow. Validate its configuration before reloading. Verify Vaultwarden remains
healthy before and after the reload, then verify the new `/health/ready` route.
Use the inspected host details below for this deployment.

## DNS at Porkbun

- `plaud` is a CNAME to the exact Amplify/CloudFront destination given by the new
  `aptlyable.info` domain association. Add Amplify's certificate-validation CNAME.
  Do not use an EC2 IP in a CNAME record.
- `api.plaud` can be an A record to the EC2 Elastic IP. If you instead use an EC2
  public DNS name, a CNAME is possible, but stopping/starting an instance without
  an Elastic IP can change its address. Use the verified host address.
- Preserve existing mail, root-domain and Vaultwarden DNS records. A wildcard
  Porkbun parking record can coexist with a new exact `plaud` record.

## Deployment baseline — September 15, 2026

**Current update:** [pilot 0.1.2 (8)](verification/2026-09-15-build8-deployment.md)
was activated at 2026-09-16 03:38 UTC. The `current` symlink now points to
`/opt/aptly-able-pilot/releases/20260916T033632Z-0.1.2-build8-0d68194`, using
`aptly-able-pilot-api:0.1.2-build8`. API configuration, schema, database,
Vaultwarden and Caddy remain as described below. The build 7 release is retained
for reviewed recovery. Temporary SSH access was removed after verification.

The preceding build 7 baseline was:

- AWS account `816069168722` (Vantedges Technologies), region `us-east-2`.
- Instance `i-066c05c21f8aa2665`, `aptlyable-vaultwarden-prod-01`, Ubuntu 24.04,
  `t3.small`; Elastic IP `3.142.86.151`.
- SSH user `ubuntu`, local key
  `/Users/zacharyzink/AptlyAble/Security/aptlyable-vaultwarden-admin.pem`.
- Release `/opt/aptly-able-pilot/releases/20260915T222716Z-0.1.2-build7-f8b5f12`;
  `current` points here after the 22:29 UTC backend update.
  Private environment is `current/deploy/pilot/.env` (mode 600).
- Image `aptly-able-pilot-api:0.1.2-build7`, built on the Mac for Linux/amd64 from
  source `f8b5f12`. The previous release and images remain available; recovery
  requires checking account-deletion compatibility before any rollback.
- The API uses bounded pools: 2 ordinary, 2 device, 1 transcription worker,
  2 upload and 1 deletion connection. Only the API container was replaced.
  Additive account-deletion migrations 005 and 006 ran after a fresh backup.
  Caddy, database/Vaultwarden containers, mounts and private API configuration
  were preserved. The approved temporary SSH rule was removed, restoring four
  inbound rules. See [deployment verification and recovery](verification/2026-09-15-version-0.1.2-deployment.md).
- Postgres and API use only `aptly-able-pilot_pilot`, subnet `172.30.45.0/24`.
  Host traffic reaches the API from `172.30.45.1`; this exact IP is trusted.
  Database migrations 001–006 are applied and their checksums were verified.
- Persistent volumes: `aptly-able-pilot_postgres-data` and
  `aptly-able-pilot_recordings-data`. Do not run `docker compose down -v`.
- Existing system Caddy routes `api.plaud.aptlyable.info` to `127.0.0.1:4180`.
  Its original configuration was preserved at
  `/etc/caddy/Caddyfile.before-aptly-pilot-2026-09-14` before validation/reload.
- Vaultwarden remains on `127.0.0.1:8000`, using `/opt/vaultwarden/data` and its
  original container/network. Its container start time remained August 13.
  HTTPS returned 200 after this API update; Caddy was unchanged.
- Historical September 14 sample idle usage: API 65 MiB, Postgres 22 MiB. This is a
  small pilot capacity observation, not a load-test result.

Useful commands after connecting with SSH:

```sh
cd /opt/aptly-able-pilot/current/deploy/pilot
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml ps
sudo docker compose --env-file .env -f compose.yaml -f compose.shared-host.yaml logs --tail 100 api
curl --fail https://api.plaud.aptlyable.info/health/ready
curl --fail --head https://vault.aptlyable.info
```

For a private database backup:

```sh
install -d -m 700 /opt/aptly-able-pilot/backups
umask 077
sudo docker exec aptly-able-pilot-postgres-1 pg_dump -U aptly_pilot -d aptly_pilot -Fc > /opt/aptly-able-pilot/backups/pilot-$(date -u +%Y%m%dT%H%M%SZ).dump
```

Copy backups to private storage outside this EC2 host. Automated off-host backup
has not been configured. Preserve the Android signing key separately; it is not
part of the website or server bundle.

An initial custom-format database dump was created at
`/opt/aptly-able-pilot/backups/pilot-initial-20260914.dump` and copied to the Mac at
`.local/remote-pilot/pilot-initial-20260914.dump`, both with mode 600. This initial
27,487-byte dump was created after removing the synthetic test account login.

To take only this pilot offline, stop its API/Postgres Compose services. To remove
its HTTPS route, restore the saved Caddyfile, validate it, and reload Caddy. Check
for later unrelated Caddy edits before restoring a whole file. Do not stop or
remove Vaultwarden. To roll back a future API update, retain the preceding image
tag and environment, take a database backup, and check migration compatibility
before switching `RELEASE_TAG`; never reverse applied SQL by editing old files.
