# Temporary Amplify hosting

Use these two addresses during the pilot:

| Address | Purpose | Hosting |
| --- | --- | --- |
| `https://plaud.aptlyable.info` | Dashboard, enrollment page, Android download | Amplify Hosting |
| `https://api.plaud.aptlyable.info` | Accounts, assignments, enrollment and Plaud sessions | Existing EC2 server from `EXISTING_EC2_PILOT.md` |

Amplify serves the website files. The existing Fastify API and Postgres database
still need the backend server. Uploading the website alone does not enable signup
or device pairing. The app and dashboard call the API origin directly over HTTPS.

## Upload the website

The app already exists: `aptly-able-pilot`, ID `d3gnng58sv940j`, branch `pilot`,
region `us-west-2`, AWS account `116981808374`. For updates, deploy a new ZIP to
this existing branch; do not create a duplicate app. Steps 2–6 below describe
initial provisioning for a future move.

1. Run `pnpm pilot:package` in the application directory on this Mac. Use the
   generated `.local/remote-pilot/aptly-able-amplify.zip` for Amplify. This contains
   the built website and the signed Android APK; its root contains `index.html`.
   Do not upload the repository, server archive, `server.env`, or signing folder.
2. In AWS Amplify, select **Create new app → Deploy without Git**.
3. Set the app name to **aptly-able-pilot**, branch **pilot**, method **Drag and drop**.
4. Upload `aptly-able-amplify.zip` and select **Save and deploy**.
5. In **Hosting → Rewrites and redirects**, add the eight rules from
   `deploy/amplify/rewrites.json`. They are **200 rewrites**: `/enroll`,
   `/enroll/`, `/dashboard`, `/dashboard/`, `/privacy`, `/privacy/`, `/support` and
   `/support/` go to `/index.html`. This supports direct installation, demo and
   public privacy/support links.
   Do not add a blanket rewrite that turns missing APK requests into HTML.
6. In **Hosting → Custom domains**, add `aptlyable.info`. Configure only the
   **plaud** subdomain to point to branch **pilot**. Remove the automatically
   proposed root and www associations from this new app's form before saving;
   preserve any existing website on the root domain. Use Amplify's managed HTTPS
   certificate and add the CNAME and certificate-validation record Amplify provides in Porkbun.
7. Wait for the deployment and domain association to show ready. Check:
   `https://plaud.aptlyable.info` and
   `https://plaud.aptlyable.info/downloads/aptly-able-android.apk`.

The ZIP includes `customHttp.yml` with response headers, including APK download
content type and no-referrer behavior on invitation pages. On every update upload
the complete fresh ZIP; a manual deployment replaces the published website.
Keep the preceding ZIP for rollback.

AWS instructions: [manual ZIP deployments](https://docs.aws.amazon.com/amplify/latest/userguide/manual-deploys.html),
[custom domains](https://docs.aws.amazon.com/amplify/latest/userguide/custom-domains.html),
[custom headers](https://docs.aws.amazon.com/amplify/latest/userguide/setting-custom-headers.html).

## Start the backend

Follow `docs/EXISTING_EC2_PILOT.md`. In Porkbun, use an **A record for `api.plaud`**, pointing to
the server's static IP. Keep the **plaud** CNAME pointed at Amplify. The prepared
private server environment contains the correct API hostname, allowed website
origin and QR destination. Do not replace it with the old local development codes.

Once the backend health check succeeds, use the custom website address for the
end-to-end test. The default `amplifyapp.com` preview address is not automatically
allowed to make authenticated API calls. This avoids enabling arbitrary origins.

## Move to the Aptly Able domain later

This is a configuration migration; the app and dashboard stay one codebase.

1. Decide the new website and API hostnames, then connect the website hostname to
   the same Amplify app (or transfer the complete deployment into Aptly Able's AWS
   account if ownership is also moving).
2. Add the new website to the API's exact `BROWSER_ORIGINS` list and change
   `ENROLLMENT_BASE_URL` to the new website's `/enroll` path. Provision HTTPS for
   the API hostname. Complete the planned security work before expanding access.
3. Update the two origin constants in `scripts/package-pilot.mjs`, and build the
   app with the new explicit `EXPO_PUBLIC_API_URL`. Increment the app version/build
   number and retain the Android signing identity. Build and distribute an iOS
   update through TestFlight too. Repackage/redeploy the website.
4. Keep the old API address serving during the transition: already-installed apps
   have that address embedded. A website redirect by itself does not update them.
   Keep old invitation URLs working until their maximum seven-day expiry passes.
5. Preserve the same database for the move, or back it up and migrate it in a
   planned maintenance window. Moving the website must not create new accounts
   or require recorder re-pairing by itself.

## Status

September 15, 2026: Amplify deployment job **7** succeeded. The Android download
is **0.1.2 (7)**. The complete website preserves the dashboard demo, enrollment
flow and existing assets, and adds direct public privacy/support routes. All 23
public files and nine entry routes passed live hash/header verification.
The compatible EC2 backend was deployed first, including account-deletion
migrations 005 and 006; its health and existing service preservation were checked.
See [the deployment record](verification/2026-09-15-version-0.1.2-deployment.md)
for exact artifacts, backup and recovery cautions. Physical-device acceptance
remains outstanding; these checks do not establish App Store readiness.

Porkbun records created for this deployment (existing root/mail/Vaultwarden
records preserved):

| Type | Host within aptlyable.info | Value |
| --- | --- | --- |
| CNAME | plaud | d3giwtu09dn7uj.cloudfront.net |
| CNAME | _ae395a943eff9be65d7fba14af04fc39 | _5e54a75a440a5bd5cc957d5f8c3203b4.wzccmgtwzk.acm-validations.aws. |
| A | api.plaud | 3.142.86.151 |

The Amplify website and EC2 backend are currently in different AWS accounts.
The local default AWS CLI profile manages Amplify; the EC2 server was verified
through the signed-in Vantedges console and accessed by SSH. TestFlight is paused
at the owner's request. The website has no iPhone download link; an iPhone with
Aptly Able already installed can still continue through an enrollment link.
