# Enrollment UI independent source review

Reviewed 2026-09-10 against the accepted enrollment flow and UI implementation plan. This is a source review with a later isolated in-memory controller check; the root task owns database, browser, build, and full-suite verification. The initial findings below are preserved as history; the scoped re-review section gives their current status. Line references may move during formatting.

**Final scoped verdict: all four original findings and the two follow-up regressions are ADDRESSED. No outstanding actionable finding remains from this review.** The historical review rounds below document what was found and corrected. This verdict does not substitute for root browser, database, export, or physical-device verification.

## Actionable findings

1. **P1 — asynchronous journal writes can outlive the current invitation/account.** `apps/mobile/src/features/enrollment/enrollment-controller.ts:176-184` resumes after saving the claim journal without rechecking the generation, then mutates state and calls the API using the mutable current invitation. A new link or sign-out during a native SecureStore write can start the old claim under the replacement state, abort its request, or leave the screen in `claiming`. The restore path also publishes an operation after an awaited journal save without rechecking the generation (`:127-128`), and queued saves close over mutable `savedJournal`. Capture immutable request/journal values, check the generation after every awaited storage operation, and make sign-out clear visible state immediately. Verify with deferred storage promises, not only deferred HTTP responses.

2. **P1 — rescanning a claimed invitation destroys restart recovery.** `apps/mobile/src/features/enrollment/enrollment-controller.ts:90-96` unconditionally clears the recovery journal for every incoming invitation. `EnrollmentScreen.tsx:32` feeds the native launch URL through this path. After the server commits a claim but the response is lost, reopening the original QR discards the only idempotency key before the user signs in; resolving the already-used token cannot recover the existing operation. The same failure affects a saved enrollment launched again through its original link. Preserve same-actor operation recovery while processing an incoming invitation, and explicitly distinguish a replacement invitation from a repeated launch. Verify restart plus original-link delivery, both with and without a recorded operation ID.

3. **P2 — saved-operation failures have no working in-screen retry.** `apps/mobile/src/features/enrollment/enrollment-controller.ts:198-207` changes a failed status refresh to the generic error phase. `EnrollmentScreen.tsx:108` offers only `claim()` when a preview remains; that method immediately exits because a successful claim cleared the invitation. Restored operations have no preview, so no retry appears at all. A transient network failure therefore strands a saved operation until a full page/app restart; signing out clears its recovery journal. Provide an operation/recovery retry that retains the journal and routes to GET operation/claim lookup rather than a new claim. Include unauthorized recovery that returns to sign-in without discarding the resumable operation.

4. **P2 — successful admin revocation followed by a failed read leaves a usable-looking stale QR.** `apps/admin/src/features/assignments/use-workspace.ts` clears the invitation only after the follow-up `adminAssignment` read in `revoke` and `end` (initial review `end` lines 176-180). If the mutation commits and the GET fails, the old QR, copy/open controls, and active assignment detail remain visible. The server still rejects revoked invitations, but the administrator is encouraged to distribute a link they just invalidated. Clear the QR at mutation start or successful mutation completion and retain explicit refresh guidance until authoritative details return. Verify POST success followed by GET rejection for both actions.

## Other inspected boundaries

- Shared API client validates response shapes, suppresses upstream response text in errors, avoids cookies and redirects, validates the configured origin, and supports timeout/cancellation. No raw credential storage was found in the inspected client paths.
- Admin access verifies the returned administrator role; server read routes and query implementations both enforce the role. Operation and claim-key lookups include the authenticated actor in the SQL predicate.
- Admin reads expose serial suffixes and safe token summaries, with explicit 25-item pagination and a load-more user control. QR material remains component memory.
- Web link handling reads fragment credentials and replaces the current history entry before returning the link to the screen. Query tokens are rejected by the parser. This source review does not establish browser timing or native app-link behavior.
- The new display-name change is in migration 002. This review did not independently compare migration 001 against a historical checksum.
- Confirmation dialogs and assignment-keyed detail components prevent ordinary selection changes from silently retargeting a confirmation. Root runtime verification should still cover the interaction.

## Limits and verification ownership

No code was changed by this reviewer. No full suite, database mutation, commit, deployment, or parent-repository operation was performed. The worker's mobile report is implementation evidence, not independently reproduced runtime evidence. Root reports its pre-fix workspace check passed and is performing browser verification; scoped regression results and final native export results must be recorded after fixes.

Local development access is the approved scope while the production sign-in provider remains undecided. Real iOS Universal Links, Android App Links, store continuation, and physical Plaud SDK/hardware proof are not part of this phase. Backend `pending` means enrollment saved with hardware setup still pending. The existing recorder simulation remains a separate preview.

## Scoped re-review after first fixes

Verdict: **findings 1 and 4 ADDRESSED; findings 2 and 3 NOT ADDRESSED in full. One replacement-flow regression remains.**

1. **ADDRESSED for the reported stale claim/restore publication race.** Claim now captures the actor, token and key and checks its generation after initial storage before starting HTTP. Restore checks its generation after save/clear. The focused regression tests cover delayed claim storage during sign-out and replacement, and a late claim response. This is a verdict on the concrete reported race, not proof of every controller lifecycle ordering.
2. **NOT ADDRESSED — native startup ordering still loses the journal.** The new test awaits `initialize()` before delivering the incoming link. Actual initialization is asynchronous: `initialize()` captures generation at controller lines 80-84, while `receiveInvitation()` increments it at line 92. If the native launch URL arrives before SecureStore load finishes, the recovered journal is ignored. An isolated in-memory run of `initialize pending -> receiveInvitation(original) -> load resolves -> signIn` produced `phase: error`, `operation: null`, and the unavailable-invitation message. Coordinate initial journal loading with invitation delivery/sign-in, and test this ordering explicitly.
3. **NOT ADDRESSED in full — refresh of an already displayed operation works, initial recovery failure remains stranded.** The new Retry status refresh action fixes the original post-save GET failure. However, if the first GET during sign-in restoration fails, controller lines 143-145 produce error with no operation/preview, and the screen at lines 108-110 offers no recovery retry. Calling `refresh()` is also a no-op because no operation has been published. An isolated runner reproduced this state with a valid journal and a transient first GET failure. Add a recovery retry capable of using the journal before an operation is loaded.
4. **ADDRESSED.** Admin revoke/end clear the in-memory QR before the mutation and clear selected detail after POST success before the follow-up GET. GET failure therefore cannot leave QR copy/open controls or actionable selected detail. Root browser fault-injection verification remains pending.

**P2 regression in finding 2's fix — revoked enrollment cannot accept a replacement.** `receiveInvitation()` now always preserves `snapshot.operation` and derives its phase from that operation (controller lines 101-106), while `resolveInvitation()` exits whenever an operation exists. The revoked-screen button `EnrollmentScreen.tsx:100` calls `receiveInvitation('')`; an isolated runner confirmed it remains `revoked`. Delivering a replacement token also leaves the old operation selected. Provide an explicit transition that clears the old revoked operation/journal for a new invitation without discarding valid recovery on an ordinary original-link reopen.

Verification for this re-review used the current TypeScript controller with in-memory client/storage doubles through Node/tsx. It wrote no source/test files and touched no database. It reproduced the three remaining scenarios above; it did not rerun the full suite or claim native device execution.

## Scoped re-review after second fixes

The original four findings and the revoked-replacement regression are now addressed in their reported scenarios. One P2 branch error in the new recovery retry remains before closure.

- Startup recovery now uses a shared initialization promise and a lifecycle epoch independent of incoming link generations; sign-in waits for initialization. The added test delivers the invitation before delayed journal loading resolves.
- The initial recovery failure now has a dedicated `recovery-error` state and **Retry enrollment recovery** action. Immutable local journal values are captured for storage callbacks.
- Revoked enrollment now uses explicit `startNewInvitation()` to clear the old operation and accept the replacement.
- Sign-out publishes the cleared snapshot immediately and does not publish again after asynchronous journal clearing; old claim completion only clears its own tracked promise.
- Web scrubbing preserves Expo's existing `history.state`, replaces the current fragment, observes later hash changes, and removes its listener on cleanup. The screen ignores late initial-link delivery after unmount. No new source-level defect was found in these inspected changes; root owns browser behavior verification.

**P2 — recovery retry returning 404 stays in resolving.** At `enrollment-controller.ts:264-266`, `retryRecovery()` ignores the `missing` result from `recoverJournal()`. If a journal key was saved but its claim never reached the server, the first restart lookup can fail offline and its retry can correctly return 404. Recovery clears the journal but leaves the screen in `resolving` without an exit. An in-memory runner reproduced `recovery-error -> retry -> resolving`. Handle `missing` by resolving the pending invitation or displaying `needs-invitation`, matching the existing sign-in behavior. Test both outcomes.

Independent focused verification: `./node_modules/.bin/vitest run apps/mobile/test/enrollment-controller.test.ts apps/mobile/test/enrollment-link.test.ts apps/mobile/test/enrollment-links-web.test.ts` — **3 files, 25 tests passed**. The separate in-memory missing-operation retry reproduction exposed the remaining branch above. No source file or database was modified.

## Final narrow verification

The missing-operation retry branch is **ADDRESSED**. `retryRecovery()` now checks the recovery result and current generation, resolves a retained invitation when present, and otherwise displays `needs-invitation`. The new regression exercises offline recovery followed by 404 with a retained invitation and reaches `ready`. A separate independent in-memory run verified offline recovery followed by 404 without an invitation reaches `needs-invitation`.

The same independent focused Vitest command now passes **3 files, 26 tests**. Only the final branch, its regression, and these scoped tests were inspected in this last pass; no further broad review was performed. Root reports the live browser sign-in/open-fragment/claim flow passed and is continuing reload and fault-injection verification; that report is not independent browser execution by this reviewer.
