# Test Aptly Able on a physical phone

The installed development app can run without its USB cable. Keep the phone and Mac on the same private Wi-Fi network, keep the Mac awake, and keep the API, phone API bridge and Expo development server running. This build is not an independently hosted/store-distributed app.

## Local phone API connection

The API normally binds only to `127.0.0.1:4100`. A physical phone's `localhost` is the phone itself. For temporary phone testing, the explicit development bridge forwards the Mac's private IPv4 address on port 4100 to that loopback API:

```sh
# Use this Mac's current private Wi-Fi address (ipconfig getifaddr en0 on this Mac).
pnpm dev:phone-api 192.168.110.40
```

The bridge accepts only an RFC 1918 IPv4 address actually assigned to this computer, rejects wildcard/public addresses and production mode, forwards only to the fixed loopback API, and does not log requests or load credentials. All existing API authentication, role and assignment checks still apply. Stop it with Ctrl+C when testing ends. This development connection uses HTTP on the private network; use it only on a trusted test network. It provides no internet tunnel or public deployment.

The current ignored `apps/mobile/.env.local` contains only these public connection settings:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.110.40:4100
EXPO_PUBLIC_DEV_HTTP_ORIGIN=http://192.168.110.40:4100
```

The HTTP exception requires an exact matching origin and a private IPv4 address. The mobile app supplies that exception only in a development build (`__DEV__`). Release builds must use an HTTPS API URL and omit the development exception. Do not put Plaud secrets, SDK tokens or user access codes in the mobile environment.

Start/restart the preview server after changing these values:

```sh
pnpm --filter @aptly/mobile exec expo start --dev-client --lan --port 8088
```

The separate administrator dashboard can continue using the loopback API from this Mac. If the Mac's Wi-Fi address changes, stop/restart the bridge with the new address, update both mobile settings, restart Expo and reopen the development project on the phone. The database and API process remain managed through the existing local setup commands.

## Enroll the installed phone app

For the installed development app, set this destination in the ignored `apps/api/.env`:

```dotenv
ENROLLMENT_BASE_URL=aptlyable://enroll
```

Rebuild and restart the API after changing its configuration. The API permits this exact native destination only outside production; production still requires HTTPS. The app already registers the `aptlyable` scheme, so this change needs no new iPhone build. Keep `http://localhost:8088/enroll` only for browser testing on the Mac: scanning it on a phone opens the phone's own localhost and cannot enroll the installed app.

In the administrator dashboard, save the complete serial and assignment, then generate an enrollment QR. If a QR was generated before changing the destination, select **Generate replacement QR** and confirm **Generate replacement**. Existing QR images do not change when the server configuration changes.

Scan the new QR with the iPhone Camera and accept opening Aptly Able. The installed app receives the invitation in the URL fragment. Sign in with the local **User access code** if requested, confirm the assigned recorder, and continue setup. **Copy setup link** also provides a link that can be pasted into the app's invitation field. The dashboard shows **Open setup** only for browser invitations; native invitations must open on the phone. Install-from-QR and verified HTTPS app links remain future work.

## What works and what remains

The signed iPhone app is installed, developer trust is approved, and the user confirmed the Aptly Able home screen. Native JavaScript loaded from the Mac's development server. A check inside the phone's running JavaScript runtime reached the private API with HTTP 200 and confirmed the native Plaud module is present. Plaud partner and per-user token acquisition has passed against the real US endpoints.

To pair: provide the complete NotePin S serial, assign that recorder to the local user, claim its enrollment in the phone app, then allow Bluetooth and connect. Real pairing/handshake and unpair acceptance have not passed yet. USB installation approval, app launch, API reachability and a successful hardware handshake are separate milestones.

See [native setup](PLAUD_NATIVE_SETUP.md) and [verification](verification/NATIVE_RECORDER.md).
