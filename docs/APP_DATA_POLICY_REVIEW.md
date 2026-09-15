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
7. SDK permissions and diagnostic behavior verified against the shipping release, including any location access used for Wi-Fi identification. No recording-location feature is included.

App Store privacy label answers still require an owner-reviewed data inventory and exact vendor behavior. Do not choose “Data Not Collected” based on an empty app manifest. No privacy label, encryption questionnaire, legal acceptance or corporate policy change was submitted by this task.

The site accessibility statement describes the website's goals; it is not evidence that this mobile release passed VoiceOver, Dynamic Type, contrast or native permission-flow testing.
