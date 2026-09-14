# Alternative: dedicated pilot API server

**Current choice:** reuse the existing Vaultwarden EC2 host. Follow
[Existing EC2 setup](EXISTING_EC2_PILOT.md). Do not create the Lightsail instance
below unless the hosting decision changes.

The website and app download will be hosted by Amplify at **https://plaud.aptlyable.info**.
This guide starts the separate API/database at **https://api.plaud.aptlyable.info**,
the address embedded in the Android APK. Follow `docs/AMPLIFY_PILOT.md` for the
website upload. Nothing has been deployed to AWS by this change.

The dashboard supports creating an account, assigning your own NotePin S, choosing
Android or iOS, and generating the installation/enrollment QR. The phone signs in
with the same email and password. A QR does not automatically continue after an
app install: return to the browser invitation and tap **Continue setup**.

## 1. Create the server

In AWS Lightsail, create a **Linux / OS only / Ubuntu 24.04 LTS** instance in
**Oregon (us-west-2)**. Select the **4 GB, public IPv4** plan (`medium_3_0`), named
`aptly-able-pilot`. On September 14, 2026 the AWS API listed this plan at **$24/month**;
check the current price before creating it. This allows room to build the images.

Attach a Lightsail static IPv4 address to the instance. In its Networking tab,
allow TCP **80** and **443**. Limit SSH **22** to your computer's public IP where
possible. The database and API ports are not published by the supplied deployment.

In Route 53, open the `aptlyable.info` hosted zone and create an **A record**
named `api.plaud`, pointing to that static IP. Keep `plaud` pointed at Amplify.
Check for an existing record before adding it. Preserve all other records.

Reference: [Lightsail getting started](https://docs.aws.amazon.com/lightsail/latest/userguide/getting-started-with-amazon-lightsail.html).

## 2. Install Docker on that server

Open the instance's browser SSH terminal and run:

```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo mkdir -p /opt/aptly-able-pilot
sudo chown ubuntu:ubuntu /opt/aptly-able-pilot
```

If you prefer Docker's own packages, follow its
[Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/).

## 3. Upload the prepared files

On this Mac, `pnpm pilot:package` produces:

- `.local/remote-pilot/aptly-able-pilot-server.tar.gz` — API source,
  Docker configuration and instructions. No account, database or
  Plaud secrets, no Android signing key, and no iOS/Android SDK source binaries.
- `.local/remote-pilot/server.env` — **private** server configuration. It copies
  the existing Plaud SDK client credentials and creates a new database password.
  Keep it out of the public download directory. Repackaging preserves this file.

Download your Lightsail SSH key from the AWS console. In a terminal on your Mac,
set the two values to your actual file and server IP, then run:

```sh
PILOT_SSH_KEY="/absolute/path/to/your/Lightsail-key.pem"
PILOT_SERVER_IP="your-static-ip"
chmod 600 "$PILOT_SSH_KEY"
scp -i "$PILOT_SSH_KEY" /Users/zacharyzink/AptlyAble/aptly-able-app/.local/remote-pilot/aptly-able-pilot-server.tar.gz "ubuntu@$PILOT_SERVER_IP:/opt/aptly-able-pilot/"
scp -i "$PILOT_SSH_KEY" /Users/zacharyzink/AptlyAble/aptly-able-app/.local/remote-pilot/server.env "ubuntu@$PILOT_SERVER_IP:/opt/aptly-able-pilot/server.env"
```

## 4. Start the application

Back in the server SSH terminal:

```sh
cd /opt/aptly-able-pilot
tar -xzf aptly-able-pilot-server.tar.gz
mv server.env deploy/pilot/.env
chmod 600 deploy/pilot/.env
cd deploy/pilot
sudo docker compose --env-file .env build
sudo docker compose --env-file .env up -d postgres
sudo docker compose --env-file .env run --rm api node apps/api/dist/bootstrap/migrate.js
sudo docker compose --env-file .env up -d
sudo docker compose --env-file .env ps
```

The one-time migration creates the account/enrollment tables. Run migrations on
every update before starting the new API; old migration files must not be edited.
Caddy obtains the HTTPS certificate once DNS resolves to this server and ports
80/443 are reachable. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

The Compose network uses `172.30.45.0/24`. Caddy has `172.30.45.3`, the only proxy
trusted to forward client IPs for login throttling. If this conflicts with an
existing Docker network, change all three static addresses, the subnet and
`TRUSTED_PROXY_IP` together. Do not publish the API directly or enable broad proxy
trust. No external CDN/proxy is assumed by this configuration.

## 5. Verify before sending the link

```sh
curl --fail https://api.plaud.aptlyable.info/health/ready
curl --fail https://api.plaud.aptlyable.info/v1/auth/config
curl --fail --head https://plaud.aptlyable.info/downloads/aptly-able-android.apk
```

Expect `{"status":"ok"}`, account configuration with `pilotEnabled: true` and
`developmentEnabled: false`, and a successful APK response. Visit the website,
create a test account, assign a test recorder serial, select Android, and generate
a QR. Test the QR on an actual Android phone before declaring Android Bluetooth
pairing and recording transfer accepted. Emulator packaging checks do not prove it.

Do not register someone else's real serial as a placeholder. To test the complete
physical workflow, have the owner enter his own serial in his own account.

## What the owner does

1. Visit **https://plaud.aptlyable.info** on a computer and create his account.
2. Choose **Assign recorder**, enter his NotePin S serial, and save.
3. Select **Android**, generate the enrollment QR, and scan it with his phone.
4. Download the APK, open it, and allow that browser to install it when Android
   prompts. Open the invitation in the phone's normal browser if an in-app browser
   cannot download or open the app.
5. Return to the invitation page and tap **Continue setup in Aptly Able**.
6. Sign in with the same account, accept enrollment, allow Bluetooth/Nearby devices,
   and connect the powered-on NotePin S nearby.
7. Record a short conversation, stop recording, and keep Aptly Able open. Confirm
   automatic transfer, playback, optional download, deletion and reconnect.

Android installation background: [Android publishing](https://developer.android.com/studio/publish).

## iPhone / TestFlight steps

The iOS selection generates an iPhone invitation now. Existing installs can use
**Continue setup**. New remote iPhone installs need a real TestFlight build and
public invitation link; the page clearly says unavailable until configured.

1. Enroll in the Apple Developer Program if the account only has free device
   signing. Create an App Store Connect app for `com.aptlyable.mobile`.
2. Build an iOS Release archive with the same HTTPS API origin and pilot sign-in
   mode, using distribution signing. Upload it to App Store Connect.
3. Add the build to a TestFlight external testing group, complete beta review
   information and submit it to Apple. Enable a public link after approval.
4. Set `VITE_IOS_TESTFLIGHT_URL` to the real `https://testflight.apple.com/join/...`
   URL when packaging the Amplify website, then redeploy the resulting ZIP:

```sh
VITE_IOS_TESTFLIGHT_URL=https://testflight.apple.com/join/your-real-code pnpm pilot:package
```

This local change does not create an Apple developer membership, submit a build,
or bypass Apple's review. See [Apple external tester instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers).

## Keep the pilot recoverable

- Back up the Android signing directory specified in `docs/ANDROID_PILOT.md`
  separately from the public APK. Updates must use the same key.
- Keep a private copy of `deploy/pilot/.env`; losing the database password can
  prevent the configured API from connecting. Do not regenerate it on updates.
- From `deploy/pilot`, make a database backup before upgrading:

```sh
umask 077
sudo docker compose --env-file .env exec -T postgres pg_dump -U aptly_pilot -d aptly_pilot > aptly-pilot-backup.sql
```

- Volumes preserve Postgres, recorder processing files and HTTPS certificates.
  `docker compose down` preserves volumes. Do not add `--volumes` to routine stops.
- Change `RELEASE_TAG` for updates and retain the previous images. To roll back
  application containers, restore the preceding tag and run `up -d --no-build`.
  Never roll back an additive database migration by editing its SQL history.
- Download URLs are website-build configuration. After changing them, repackage and redeploy the Amplify ZIP.
  Changing the API hostname also requires rebuilding and redistributing the app.

## Pilot limits

Accounts use email/password with seven-day server sessions; credentials remain in
app/tab memory, so reopening requires sign-in. Email verification, password reset,
organization administration and public-launch hardening remain future work. Signup
grants self-service access only. The API cannot verify email ownership and makes no
claim that the address is verified.

Real Android device acceptance and remote HTTPS/TLS acceptance remain manual until
hardware and the AWS server are available. Audio transfer remains local-first with
the existing cache limit. Server audio/AI upload and automatic transcription are
still stubs; this server deployment does not turn them on.
