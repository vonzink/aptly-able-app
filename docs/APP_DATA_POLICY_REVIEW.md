# App data notice and owner review

The user supplied these public company pages on September 15, 2026:

- Privacy: https://www.aptlyable.com/privacy
- Terms: https://www.aptlyable.com/terms
- Accessibility: https://www.aptlyable.com/accessibility

They identify **Aptly Able, LLC** and **info@aptlyable.com**, and link to https://www.aptlyable.com/contact. They primarily describe the company website. Their existence is not evidence that all mobile recording/SDK processing has been covered or approved.

The new app-specific notice is authored once in `packages/product-content/src/index.ts`, rendered locally at mobile `/privacy` and anonymously at website `/privacy`. Both surfaces provide the existing company policy/terms/accessibility/contact links. Public `/support` provides an account-deletion help path. These local changes have not been published.

Before marking `privacyPolicyReviewed` true in `apps/mobile/store-readiness.json`, the owner should review the notice and update/approve the policy that will be used as the App Store privacy URL. Confirm:

1. The responsible entity and monitored app/privacy contact.
2. Account identifiers and recorder serial/model shared with Plaud for authentication/binding, plus vendor SDK data flows and destinations not established by this repository alone.
3. Local audio, notes, imported transcripts, OS backups, device-shared manual imports and temporary/kept files.
4. Optional pilot AI upload to Aptly Able/Plaud, related metadata/transcripts, downstream processors, retention, training use or exclusions if supported by actual contractual evidence. Store profile excludes cloud transcription for now.
5. A concrete deletion/retention procedure covering live service files/rows, Plaud/downstream data, hosting logs, backups, historical orphan uploads and restore protection. The software currently keeps requests pending until all required confirmations exist; the owner approved completion within seven days, including provider and backup cleanup, on September 15, 2026. The app records and displays that deadline; actual provider/backup capacity and queue ownership remain unverified.
6. What remains on hardware and in user exports, what deleting local audio does, and how an account request differs from full completed erasure.
7. SDK permissions and diagnostic behavior verified against the shipping release, including any location access used for Wi-Fi identification. Recording location is an optional local-only feature. Review precise/approximate location use, native foreground/background behavior, backup exclusions and the explicit Maps handoff before approving the next release.

App Store privacy label answers still require an owner-reviewed data inventory and exact vendor behavior. Do not choose “Data Not Collected” based on an empty app manifest. No privacy label, encryption questionnaire, legal acceptance or corporate policy change was submitted by this task.

The [September 18 SDK intake and privacy evidence](verification/2026-09-18-submission-gates.md) records exact installed iOS hashes and the installed/candidate Android hashes, static storage/logging findings and the remaining runtime capture requirements. The official Android candidate was not installed. SDK binary distribution rights are a separate gate (`providerDistributionReviewed`); an Apache license for sample code does not establish rights to distribute the proprietary binaries. Keep both vendor gates false until their evidence is recorded.

The site accessibility statement describes the website's goals; it is not evidence that this mobile release passed VoiceOver, Dynamic Type, contrast or native permission-flow testing.

## September 18 phone recording addition

The app now requests microphone access for explicit phone recording, including background audio while locked. Android uses a private microphone foreground service and notification controls; iOS has a Live Activity extension. Its shared app-group content contains only timing/status and widget layout, never audio, recording titles, notes, account IDs or transcripts. Live Activity payload storage may remain in the local app group after an activity ends; it must not be used for sensitive recording metadata.

Review the new disclosure and data inventory before submission: unfinished audio is temporary cache data; saved phone audio remains in the account-scoped local library until removed. Optional pilot transcription uses the same consented upload flow as imported audio. Account cleanup includes unfinished and saved phone recordings. The Plaud-only location option does not capture location for phone microphone recordings. No owner/vendor review flag is marked complete by this implementation.
