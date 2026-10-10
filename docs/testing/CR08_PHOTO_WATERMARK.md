# CR-08 — photo date/time watermark

Updated 2026-10-10. Level 1 implementation checkpoint; physical-phone acceptance pending.

New camera captures and gallery picks burn Malaysia processing date/time into JPEG pixels before compression
and SHA-256. Example: `10 Oct 2026 14:32`. The device clock is read once at processor entry; EXIF and
`capturedAt` do not choose the stamp. The existing `formatMalaysiaDateTime` helper supplies Asia/Kuala_Lumpur
formatting, with its comma removed and a single-digit hour padded locally. Existing UI formatting is unchanged.

The bottom-right stamp uses white semibold text on a 65% opaque black rounded box. Font size is 2.5% of the
output long edge, minimum 14 px. Every quality/size attempt redraws the original decoded source, then draws
the stamp at the actual output resolution. The existing compression target (1.5 MiB), six attempts and hard
2 MiB output limit remain in place. Hash and size describe the final stamped Blob. No schema or attachment
record shape changed. No existing photo is processed automatically.

## Caller audit

Every production caller (paths relative to `apps/web/src/`):

| Caller | Input |
| --- | --- |
| `attachments/PhotoEvidenceField.tsx` | Raw camera frame or newly selected gallery File; abort signal preserved |
| `co2/V7EvidenceField.tsx` | Raw camera/gallery; shared CO2 and Wet Chemical component |
| `fm200/Fm200EvidenceField.tsx` | Raw camera/gallery |
| `fireAlarm/FireAlarmV6EvidenceField.tsx` | Raw camera/gallery |
| `fireAlarm/FireAlarmV7EvidenceField.tsx` | Raw camera/gallery |
| `hydrant/HydrantV7EvidenceField.tsx` | Raw camera/gallery |
| `hoseReel/HoseReelV7EvidenceField.tsx` | Raw camera/gallery |
| `automaticSprinkler/AutomaticSprinklerV7EvidenceField.tsx` | Raw camera/gallery |
| `dryWetRiser/DryWetRiserV7EvidenceField.tsx` | Raw camera/gallery |
| `smokeVentilation/SmokeVentilationV7EvidenceField.tsx` | Raw camera/gallery |
| `fireIntercom/FireIntercomV7EvidenceField.tsx` | Raw camera/gallery |
| `fireRatedRollerShutter/FireRatedRollerShutterV7EvidenceField.tsx` | Raw camera/gallery |

Test callers: `apps/web/tests/automatic-sprinkler-photo-evidence.html` (valid source, corrupt input,
oversized input, aborted calls, obsolete processing, newer processing and replacement source).
New `photo-watermark.html` exposes the processor to `photo-watermark.spec.ts` for pixel, clock, fallback,
retry and large-input tests. The function declaration itself is not a caller.

`CameraCaptureDialog.tsx` encodes an unstamped camera frame and passes it to its caller once.
`PhotoEvidenceField.tsx` processes only that capture or a file-input selection; previews use stored Blob URLs.
`attachmentRepository.ts` persists the processed Blob/size/hash without decoding or recompressing it.
`correctedCopy.ts` rekeys records/photos and copies the existing Blob, hash and capturedAt unchanged.
`syncEngine.ts` retries uploads of the stored attachment; `attachmentApi.ts` places that Blob in FormData.
None of corrected copy, local retry, sync or preview re-runs the processor. Compression resizing always uses
the original decoded source, so attempts do not stamp the previous attempt. Server Sharp normalization
re-encodes pixels but does not stamp them. A user importing an externally watermarked/exported image is
outside this automatic-path guarantee; pixel content has no reliable provenance marker.

Existing byte/hash assertions remain unchanged; none required weakening or new fixed hashes.

## Verification

| Gate | Result |
| --- | --- |
| Web typecheck | PASS |
| Production web build | PASS; existing large-chunk warning |
| Focused photo browser tests | PASS, 4/4 after fixes |
| Affected browser regressions | PASS, 5/5 |
| Focused Node regressions | PASS, 18/18 |
| git diff --check | PASS, line-ending warnings only |
| Protected file working-tree status | PASS, no changes |
| Standing protected files byte-identical to e30c649 | Not fully satisfied before this task: Fire Alarm V6 evidence file has a committed uploader-ID comparison fix; untouched here |
| API builds, historical/evidence units and disposable-Postgres integrations from standing broad gate list | NOT RUN; this brief scopes CR-08 to Level 1 web/photo checks, with no API or schema edits |
| Physical phone, installed-PWA force-close, deployed accepted detail/PDF | NOT RUN; owner retest below |

The first sandbox build failed with EPERM resolving main.tsx; the permission-enabled build passed.
The first sandbox browser startup stalled and was cancelled; the permission-enabled run completed.
The initial focused run caught midnight hour padding, the test's wrong assumption about the existing
floating-point quality-loop resize count, and the large source limit. Midnight formatting was fixed,
retry expectations now check the actual existing 1296 px fifth-attempt output and 32 px font, and the
large-image test proves both full-quality rejection and processing of an admissible 24 MP image.
The five affected specs passed in that first completed run. Final focused rerun passed all four cases.

Photo proofs: JPEG magic bytes and real decode, exact final SHA-256 and Blob size, <=2 MiB, non-background
pixels in the bottom-right, surviving white glyphs inside the dark box, unchanged white pixels elsewhere,
different hashes for different injected timestamps, Malaysia midnight rollover, HTMLImageElement fallback,
offline processing, one clock read across five encoding attempts, and actual output dimensions after resizing.
The existing photo harness also passes camera track cleanup, cancellation, local persistence, replacement,
frozen submission, failed-upload recovery and sync checks. Corrected-copy specs cover all evidence systems;
Fire Intercom/Smoke Ventilation cover mocked offline round trips; FM200 covers evidence-first sync.

## Full-size photo measurements and limits

Desktop headless Chromium, synthetic deterministic textured JPEGs; timings cover decoding, scaling, stamping,
JPEG encoding and hashing, excluding source-fixture creation. These are observations, not phone guarantees.

| Source | Source bytes | Stamped output | Processing time |
| --- | ---: | --- | ---: |
| 4032 x 3024, JPEG quality 0.92 (12 MP) | 10,567,239 | 1600 x 1200, 873,078 bytes | 450 ms |
| 6000 x 4000, JPEG quality 0.92 (24 MP) | 21,012,142 | Rejected by existing 20 MiB input limit | No successful processing |
| Same 24 MP pixels, JPEG quality 0.82 | 15,919,385 | 1600 x 1067, 783,229 bytes | 697 ms |

Existing blockers: >20 MiB source, >40,000,000 pixels, or >12,000 px on an edge are rejected. Thus full-resolution
48/50/108/200 MP gallery photos can be blocked; users need a normal-resolution camera mode or smaller export.
The decoder runs before dimension validation, so even a subsequently rejected high-MP source can allocate
substantial memory. A single decoded RGBA surface is approximately 46.5 MiB at 12 MP, 91.6 MiB at 24 MP,
152.6 MiB at the 40 MP limit, plus output canvas, encoded bytes and decoder overhead. These are calculated
surface sizes, not measured peak process memory. Actual phone peak memory, latency, camera frame allocation
and OS termination behavior remain unmeasured. The existing camera frame canvas is full frame size and is
not explicitly reset before returning its Blob (garbage collection owns it); no unrelated lifecycle change made.

P0 remaining: 0. P1 remaining: 0 in CR-08 implementation scope.
P2/limitations: physical-phone resource and display acceptance remains with the owner; pre-existing historical
baseline discrepancy belongs to the owner/review checkpoint. Device-clock accuracy determines stamp accuracy.
Historical template V1-V6 files are unchanged relative to e30c649; this task changed no historical definitions,
CO2/Wet Chemical definition code or protected server evidence code. Do not interpret this as a full historical
test-matrix pass or release sign-off.

## Files changed

- `apps/web/src/attachments/imageProcessing.ts`: output-resolution stamp and injectable processing clock.
- `apps/web/tests/photo-watermark.html`: isolated browser entry point for the real processor.
- `apps/web/tests/photo-watermark.spec.ts`: pixel/clock/retry/large-source proofs and existing photo harness automation.
- `docs/testing/CR08_PHOTO_WATERMARK.md`: caller audit, gates, limitations and phone steps.
- `HANDOVER.md`: CR-08 checkpoint status.

All initially unrelated working-tree files left untouched. No Git mutations, deployment or database changes.

## Reproduce

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps/web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/correctedCopyWiring.test.ts tests/v7EvidenceStaleManifest.test.ts tests/ui-presentation-polish.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Focused Node regressions failed' }
npx playwright test tests/photo-watermark.spec.ts tests/corrected-copy-all-systems.spec.ts tests/fire-intercom-corrected-copy.spec.ts tests/smoke-ventilation-v7-offline.spec.ts tests/fire-intercom-v7-offline.spec.ts tests/fm200-sync-engine-evidence.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Photo/browser regressions failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
git status --short
```

This harness uses isolated browser IndexedDB and mocked API responses; it requires no Postgres or runtime data.
Chromium must already be installed for this project's Playwright version; port 4175 must be free.

## Owner phone retest

1. Deploy the reviewed build through the owner's release process; open over HTTPS and wait for Offline Ready.
   Reopen after the service-worker update. Use a disposable inspection and ensure the phone clock is accurate.
2. Take a camera photo. Open its preview and verify one readable Malaysia date/time at bottom-right.
3. Pick an older gallery photo: verify the stamp shows current processing time, not EXIF/gallery date.
   Try landscape/portrait, bright/dark backgrounds and a normal full-size phone JPEG; record resolution,
   file size, processing wait and any browser reload/crash. Check accepted input/output limits above.
4. Disable Wi-Fi/mobile data. Capture another photo, save locally, force-close the installed PWA and reopen
   offline. Confirm the photo and its original stamp survive. Submit locally and confirm Pending Sync.
5. Reconnect and sync; retry once if appropriate. Confirm exact UUID acceptance, one evidence attachment,
   and an unchanged single stamp. If using a rejected-record corrected copy, its copied photo retains its stamp.
6. Open authoritative accepted detail, then complete/review the disposable job as required and view/download
   its final PDF. Verify the embedded accepted photo still shows one legible stamp. Confirm an older stored
   photo has not acquired a new stamp. PDF/accepted-detail phone validation is still outstanding.

SAFE FOR OWNER CR-08 CODE REVIEW: YES. READY FOR DEPLOYED PHONE ACCEPTANCE: owner deployment/retest required.
Stop before staging.
