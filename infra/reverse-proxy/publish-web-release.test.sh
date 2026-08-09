#!/bin/sh
set -eu

publisher="${1:-/work/infra/reverse-proxy/publish-web-release.sh}"
caddyfile="${2:-/work/infra/reverse-proxy/Caddyfile}"
test_root="$(mktemp -d)"
caddy_pid=""

cleanup() {
  if [ -n "$caddy_pid" ]; then
    kill "$caddy_pid" 2>/dev/null || true
    wait "$caddy_pid" 2>/dev/null || true
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT INT TERM HUP

die() {
  echo "FAIL: $*" >&2
  exit 1
}

make_release() {
  release_name="$1"
  release_dir="$test_root/image-$release_name"
  mkdir -p "$release_dir/assets"
  printf '<!doctype html><script src="/assets/index-%s.js"></script>\n' "$release_name" > "$release_dir/index.html"
  printf 'self.release="%s";\n' "$release_name" > "$release_dir/sw.js"
  printf 'console.log("%s");\n' "$release_name" > "$release_dir/assets/index-$release_name.js"
  asset_number=1
  while [ "$asset_number" -le 12 ]; do
    printf 'asset %s %s\n' "$release_name" "$asset_number" > "$release_dir/assets/chunk-$release_name-$asset_number.txt"
    asset_number=$((asset_number + 1))
  done
}

publish_to() {
  destination="$1"
  release_name="$2"
  shift 2
  env \
    WEB_IMAGE_ROOT="$test_root/image-$release_name" \
    WEB_RELEASE_ROOT="$destination" \
    WEB_RELEASE_RETENTION=2 \
    "$@" \
    sh "$publisher" publish-only >/dev/null
}

expect_publish_failure() {
  destination="$1"
  release_name="$2"
  shift 2
  if publish_to "$destination" "$release_name" "$@" 2>/dev/null; then
    die "publisher unexpectedly succeeded: $*"
  fi
}

snapshot_state() {
  destination="$1"
  snapshot="$2"
  mkdir -p "$snapshot"
  cp "$destination/current/index.html" "$snapshot/index.html"
  cp "$destination/current/assets/"*.js "$snapshot/"
  cp "$destination/active-release" "$snapshot/active-release"
  cp "$destination/release-order" "$snapshot/release-order"
}

assert_pre_activation_unchanged() {
  destination="$1"
  snapshot="$2"
  cmp "$snapshot/index.html" "$destination/current/index.html" >/dev/null || die "previous index.html changed"
  cmp "$snapshot/active-release" "$destination/active-release" >/dev/null || die "active-release changed"
  cmp "$snapshot/release-order" "$destination/release-order" >/dev/null || die "release-order changed"
  previous_asset="$(find "$snapshot" -maxdepth 1 -name 'index-*.js' -type f | head -n 1)"
  [ -n "$previous_asset" ] || die "snapshot has no previous hashed asset"
  cmp "$previous_asset" "$destination/current/assets/${previous_asset##*/}" >/dev/null || die "previous hashed JS changed"
  [ ! -d "$destination/current/assets/assets" ] || die "a partial current tree was activated"
  current_id="$(cat "$destination/current/.release-id")"
  [ "$current_id" = "$(cat "$destination/active-release")" ] || die "current and active-release disagree"
}

find_recovery_workspace() {
  destination="$1"
  for candidate_workspace in "$destination"/.publish-run.????????; do
    [ -d "$candidate_workspace" ] || continue
    [ -f "$candidate_workspace/activation-pending" ] || continue
    printf '%s\n' "$candidate_workspace"
    return 0
  done
}

find_any_workspace() {
  destination="$1"
  find "$destination" -maxdepth 1 -name '.publish-run.????????' -type d -print -quit
}

find_cleanup_workspace() {
  destination="$1"
  for candidate_workspace in "$destination"/.publish-run.????????; do
    [ -d "$candidate_workspace" ] || continue
    [ -f "$candidate_workspace/cleanup-only" ] || continue
    printf '%s\n' "$candidate_workspace"
    return 0
  done
}

assert_cleanup_only_workspace() {
  destination="$1"
  cleanup_workspace_path="$(find_cleanup_workspace "$destination")"
  [ -n "$cleanup_workspace_path" ] || die "cleanup-only workspace is missing"
  [ ! -e "$cleanup_workspace_path/activation-pending" ] || die "cleanup-only workspace still has an authoritative activation marker"
  [ "$(wc -l < "$cleanup_workspace_path/cleanup-only" | tr -d ' ')" = 1 ] || die "cleanup-only marker is malformed"
  printf '%s\n' "$cleanup_workspace_path"
}

assert_recovery_artifacts() {
  destination="$1"
  recovery_workspace="$(find_recovery_workspace "$destination")"
  [ -n "$recovery_workspace" ] || die "unresolved recovery workspace is missing"
  [ -f "$recovery_workspace/activation-pending" ] || die "recovery marker is missing"
  [ -d "$recovery_workspace/previous-current" ] || die "previous current recovery tree is missing"
  [ -f "$recovery_workspace/previous-current/.publisher-tree-complete" ] || die "previous current completion marker is missing"
  case "$(cat "$recovery_workspace/previous-current/.publisher-tree-complete")" in
    "$(cat "$recovery_workspace/activation-pending")":????????????????????????????????????????????????????????????????) ;;
    *) die "previous current completion marker has the wrong release ID or digest" ;;
  esac
  [ "$(cat "$recovery_workspace/previous-current/.release-id")" = "$(cat "$recovery_workspace/activation-pending")" ] || die "previous current tree has the wrong release ID"
  [ -f "$recovery_workspace/previous-current/index.html" ] || die "previous current index is missing"
  [ -f "$recovery_workspace/previous-current/sw.js" ] || die "previous current service worker is missing"
  [ -d "$recovery_workspace/previous-current/assets" ] || die "previous current assets are missing"
  [ -f "$recovery_workspace/previous-release-order" ] || die "release-order recovery backup is missing"
  [ -f "$recovery_workspace/previous-active-release" ] || die "active-release recovery backup is missing"
  printf '%s\n' "$recovery_workspace"
}

fingerprint_recovery_artifacts() {
  recovery_workspace="$1"
  output="$2"
  (
    cd "$recovery_workspace"
    sha256sum activation-pending previous-release-order previous-active-release
    find previous-current -type f -exec sha256sum {} \; | sort
  ) > "$output"
}

assert_restored_authorities() {
  destination="$1"
  expected_release="$2"
  [ -f "$destination/current/.release-id" ] || die "restored current is missing .release-id"
  [ "$(cat "$destination/current/.release-id")" = "$expected_release" ] || die "restored current has the wrong release ID"
  [ "$(cat "$destination/active-release")" = "$expected_release" ] || die "restored active-release has the wrong release ID"
  grep -Fxq "$expected_release" "$destination/release-order" || die "restored release-order does not retain current"
  [ "$(tail -n 1 "$destination/release-order")" = "$expected_release" ] || die "restored release-order does not end with current"
}

assert_no_workspace() {
  destination="$1"
  [ -z "$(find "$destination" -maxdepth 1 -name '.publish-run.*' -print -quit)" ] || die "publisher workspace was not cleaned"
}

expect_killed_publish() {
  destination="$1"
  release_name="$2"
  kill_step="$3"
  if publish_to "$destination" "$release_name" "WEB_RELEASE_TEST_KILL_STEP=$kill_step" 2>/dev/null; then
    die "SIGKILL injection unexpectedly succeeded at $kill_step"
  fi
}

assert_rejected_id() {
  destination="$1"
  invalid_id="$2"
  expect_publish_failure "$destination" b "WEB_ACTIVE_RELEASE=$invalid_id"
}

make_release a
make_release b
make_release c

# Workspace ownership is encoded by the strict run name itself. SIGKILL in the
# first instruction after mktemp, and after ordinary initialization, leaves an
# abandoned pre-transaction workspace that the next lock owner safely removes.
for workspace_step in workspace-created workspace-initialized; do
  workspace_root="$test_root/$workspace_step"
  expect_killed_publish "$workspace_root" a "$workspace_step"
  [ -n "$(find_any_workspace "$workspace_root")" ] || die "$workspace_step did not leave its owned workspace"
  publish_to "$workspace_root" a
  workspace_release="$(cat "$workspace_root/active-release")"
  assert_restored_authorities "$workspace_root" "$workspace_release"
  assert_no_workspace "$workspace_root"
done

# activation-pending is published only by an atomic rename from its private
# preparing file. Crashes before rename leave no authoritative transaction;
# the post-rename crash leaves a complete one-line marker and full recovery
# material. Every restart returns to the unchanged A authorities.
for marker_step in marker-pre-temp marker-temp-writing marker-temp-prepared marker-pre-rename marker-post-rename; do
  marker_publish_root="$test_root/$marker_step"
  publish_to "$marker_publish_root" a
  marker_publish_release="$(cat "$marker_publish_root/active-release")"
  snapshot_state "$marker_publish_root" "$test_root/snapshot-$marker_step"
  expect_killed_publish "$marker_publish_root" b "$marker_step"
  marker_publish_workspace="$(find_any_workspace "$marker_publish_root")"
  [ -n "$marker_publish_workspace" ] || die "$marker_step did not leave its owned workspace"
  if [ "$marker_step" = marker-post-rename ]; then
    [ -f "$marker_publish_workspace/activation-pending" ] || die "post-rename crash lost the authoritative marker"
    [ "$(wc -l < "$marker_publish_workspace/activation-pending" | tr -d ' ')" = 1 ] || die "post-rename marker is incomplete"
  else
    [ ! -e "$marker_publish_workspace/activation-pending" ] || die "$marker_step exposed an incomplete authoritative marker"
  fi
  expect_publish_failure "$marker_publish_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
  assert_pre_activation_unchanged "$marker_publish_root" "$test_root/snapshot-$marker_step"
  assert_restored_authorities "$marker_publish_root" "$marker_publish_release"
  assert_no_workspace "$marker_publish_root"
done

# Compatibility with the exact P1 artifact: an older interrupted implementation
# may have copied directly into previous-current without any completion marker.
# Because intact current still identifies the prior release, recovery replaces
# only that incomplete workspace tree through the validated staging protocol.
old_partial_root="$test_root/old-partial-previous-current"
publish_to "$old_partial_root" a
old_partial_release="$(cat "$old_partial_root/active-release")"
snapshot_state "$old_partial_root" "$test_root/snapshot-old-partial"
expect_killed_publish "$old_partial_root" b marker-created
old_partial_workspace="$(find_recovery_workspace "$old_partial_root")"
mkdir "$old_partial_workspace/previous-current"
cp "$old_partial_root/current/index.html" "$old_partial_workspace/previous-current/index.html"
expect_publish_failure "$old_partial_root" b WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=preserved
old_partial_workspace="$(assert_recovery_artifacts "$old_partial_root")"
assert_pre_activation_unchanged "$old_partial_root" "$test_root/snapshot-old-partial"
# Even a previously completed tree is revalidated against its digest. Damage
# invalidates the marker, so intact current is used to rebuild it atomically.
rm "$old_partial_workspace/previous-current/sw.js"
expect_publish_failure "$old_partial_root" b WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=preserved
assert_recovery_artifacts "$old_partial_root" >/dev/null
assert_pre_activation_unchanged "$old_partial_root" "$test_root/snapshot-old-partial"
expect_publish_failure "$old_partial_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
assert_restored_authorities "$old_partial_root" "$old_partial_release"
assert_no_workspace "$old_partial_root"

# Namespace classification is deliberately narrow. A strict owned directory is
# removable without a marker, while malformed names, files, and symlinks fail
# closed and are never broadly deleted.
workspace_safety_root="$test_root/workspace-safety"
publish_to "$workspace_safety_root" a
mkdir "$workspace_safety_root/.publish-run.A1b2C3d4"
publish_to "$workspace_safety_root" a
[ ! -e "$workspace_safety_root/.publish-run.A1b2C3d4" ] || die "strict abandoned workspace was not removed"
mkdir "$workspace_safety_root/.publish-run.foreign"
expect_publish_failure "$workspace_safety_root" a
[ -d "$workspace_safety_root/.publish-run.foreign" ] || die "malformed foreign directory was deleted"
rmdir "$workspace_safety_root/.publish-run.foreign"
printf 'foreign\n' > "$workspace_safety_root/.publish-run.ABCDEFGH"
expect_publish_failure "$workspace_safety_root" a
[ -f "$workspace_safety_root/.publish-run.ABCDEFGH" ] || die "foreign workspace-shaped file was deleted"
rm "$workspace_safety_root/.publish-run.ABCDEFGH"

# Every injected pre-activation failure preserves the old shell, old hashed JS,
# and both metadata files. The source-copy case also proves no partial version is
# exposed; prospective/activation cases exercise progressively later boundaries.
for failure_step in source-copy prospective-current activation before-metadata; do
  failure_root="$test_root/failure-$failure_step"
  publish_to "$failure_root" a
  snapshot_state "$failure_root" "$test_root/snapshot-$failure_step"
  expect_publish_failure "$failure_root" b "WEB_RELEASE_TEST_FAIL_STEP=$failure_step"
  assert_pre_activation_unchanged "$failure_root" "$test_root/snapshot-$failure_step"
  [ -z "$(find_recovery_workspace "$failure_root")" ] || die "successful rollback left recovery artifacts"
done

# If current-tree rollback fails after activation, the publisher remains failed
# and preserves every recovery artifact. Repeated failed starts leave those
# artifacts unchanged. Removing the injection lets the next publisher recover A
# deterministically before its own pre-activation failure.
current_recovery_root="$test_root/recovery-current"
publish_to "$current_recovery_root" a
current_recovery_release="$(cat "$current_recovery_root/active-release")"
snapshot_state "$current_recovery_root" "$test_root/snapshot-recovery-current"
expect_publish_failure "$current_recovery_root" b \
  WEB_RELEASE_TEST_FAIL_STEP=before-metadata \
  WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=current
current_recovery_workspace="$(assert_recovery_artifacts "$current_recovery_root")"
fingerprint_recovery_artifacts "$current_recovery_workspace" "$test_root/current-recovery-before-repeat"
expect_publish_failure "$current_recovery_root" b WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=current
[ "$(assert_recovery_artifacts "$current_recovery_root")" = "$current_recovery_workspace" ] || die "current recovery workspace changed after repeated failure"
fingerprint_recovery_artifacts "$current_recovery_workspace" "$test_root/current-recovery-after-repeat"
cmp "$test_root/current-recovery-before-repeat" "$test_root/current-recovery-after-repeat" >/dev/null || die "current recovery artifacts changed after repeated failure"
expect_publish_failure "$current_recovery_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
assert_pre_activation_unchanged "$current_recovery_root" "$test_root/snapshot-recovery-current"
assert_restored_authorities "$current_recovery_root" "$current_recovery_release"
[ -z "$(find_recovery_workspace "$current_recovery_root")" ] || die "completed current recovery was not cleaned"

# A failure before metadata restoration likewise preserves the recovery source,
# marker, and both metadata backups. Retrying remains idempotent until the
# injected failure is removed, after which all authorities describe restored A.
metadata_recovery_root="$test_root/recovery-metadata"
publish_to "$metadata_recovery_root" a
metadata_recovery_release="$(cat "$metadata_recovery_root/active-release")"
snapshot_state "$metadata_recovery_root" "$test_root/snapshot-recovery-metadata"
expect_publish_failure "$metadata_recovery_root" b \
  WEB_RELEASE_TEST_FAIL_STEP=after-active-release \
  WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=metadata
metadata_recovery_workspace="$(assert_recovery_artifacts "$metadata_recovery_root")"
fingerprint_recovery_artifacts "$metadata_recovery_workspace" "$test_root/metadata-recovery-before-repeat"
expect_publish_failure "$metadata_recovery_root" b WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=metadata
[ "$(assert_recovery_artifacts "$metadata_recovery_root")" = "$metadata_recovery_workspace" ] || die "metadata recovery workspace changed after repeated failure"
fingerprint_recovery_artifacts "$metadata_recovery_workspace" "$test_root/metadata-recovery-after-repeat"
cmp "$test_root/metadata-recovery-before-repeat" "$test_root/metadata-recovery-after-repeat" >/dev/null || die "metadata recovery artifacts changed after repeated failure"
expect_publish_failure "$metadata_recovery_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
assert_pre_activation_unchanged "$metadata_recovery_root" "$test_root/snapshot-recovery-metadata"
assert_restored_authorities "$metadata_recovery_root" "$metadata_recovery_release"
[ -z "$(find_recovery_workspace "$metadata_recovery_root")" ] || die "completed metadata recovery was not cleaned"

# A SIGKILL immediately after the marker is written can leave current itself as
# the only prior tree. The next publisher first preserves that verified tree as
# previous-current, then completes the same deterministic recovery protocol.
marker_crash_root="$test_root/marker-crash"
publish_to "$marker_crash_root" a
marker_crash_release="$(cat "$marker_crash_root/active-release")"
snapshot_state "$marker_crash_root" "$test_root/snapshot-marker-crash"
if publish_to "$marker_crash_root" b WEB_RELEASE_TEST_FAIL_STEP=marker-crash 2>/dev/null; then
  die "injected marker crash unexpectedly succeeded"
fi
marker_crash_workspace="$(find_recovery_workspace "$marker_crash_root")"
[ -n "$marker_crash_workspace" ] || die "marker crash recovery workspace is missing"
[ -f "$marker_crash_workspace/activation-pending" ] || die "marker crash activation marker is missing"
[ ! -e "$marker_crash_workspace/previous-current" ] || die "marker crash unexpectedly moved current"
expect_publish_failure "$marker_crash_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
assert_pre_activation_unchanged "$marker_crash_root" "$test_root/snapshot-marker-crash"
assert_restored_authorities "$marker_crash_root" "$marker_crash_release"
[ -z "$(find_recovery_workspace "$marker_crash_root")" ] || die "completed marker-crash recovery was not cleaned"

# Crash every boundary of the still-current preservation copy. Before restart,
# current must remain byte-for-byte intact and no incomplete staging tree may be
# authoritative. A post-preservation observation failure proves the restarted
# publisher rebuilt and atomically installed a complete previous-current before
# a final restart completes deterministic recovery.
for copy_step in recovery-copy-start recovery-copy-mid recovery-copy-copied recovery-copy-validated recovery-copy-renamed; do
  copy_root="$test_root/$copy_step"
  publish_to "$copy_root" a
  copy_release="$(cat "$copy_root/active-release")"
  snapshot_state "$copy_root" "$test_root/snapshot-$copy_step"
  expect_killed_publish "$copy_root" b marker-created
  expect_killed_publish "$copy_root" b "$copy_step"
  assert_pre_activation_unchanged "$copy_root" "$test_root/snapshot-$copy_step"
  copy_workspace="$(find_recovery_workspace "$copy_root")"
  [ -n "$copy_workspace" ] || die "$copy_step lost the recovery workspace"
  if [ "$copy_step" = recovery-copy-renamed ]; then
    assert_recovery_artifacts "$copy_root" >/dev/null
  else
    [ ! -e "$copy_workspace/previous-current" ] || die "$copy_step made an incomplete previous-current authoritative"
  fi
  expect_publish_failure "$copy_root" b WEB_RELEASE_TEST_FAIL_RECOVERY_STEP=preserved
  assert_recovery_artifacts "$copy_root" >/dev/null
  assert_pre_activation_unchanged "$copy_root" "$test_root/snapshot-$copy_step"
  expect_publish_failure "$copy_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
  assert_pre_activation_unchanged "$copy_root" "$test_root/snapshot-$copy_step"
  assert_restored_authorities "$copy_root" "$copy_release"
  assert_no_workspace "$copy_root"
done

# Recovery also survives SIGKILL while restoring current and between the two
# metadata backups. The complete previous-current remains available until all
# three authorities have been checked and the recovery workspace can be removed.
for recovery_kill_step in recovery-current recovery-metadata; do
  recovery_kill_root="$test_root/$recovery_kill_step"
  publish_to "$recovery_kill_root" a
  recovery_kill_release="$(cat "$recovery_kill_root/active-release")"
  snapshot_state "$recovery_kill_root" "$test_root/snapshot-$recovery_kill_step"
  expect_killed_publish "$recovery_kill_root" b activation-current
  expect_killed_publish "$recovery_kill_root" b "$recovery_kill_step"
  assert_recovery_artifacts "$recovery_kill_root" >/dev/null
  expect_publish_failure "$recovery_kill_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
  assert_pre_activation_unchanged "$recovery_kill_root" "$test_root/snapshot-$recovery_kill_step"
  assert_restored_authorities "$recovery_kill_root" "$recovery_kill_release"
  assert_no_workspace "$recovery_kill_root"
done

# Successful startup recovery retires activation-pending before deleting any
# source or backup. Before-retire crashes preserve the complete authoritative
# transaction; every later crash leaves only non-authoritative cleanup garbage.
for cleanup_step in before-retire after-retire previous-current metadata workspace-mid; do
  recovery_cleanup_root="$test_root/recovery-cleanup-$cleanup_step"
  publish_to "$recovery_cleanup_root" a
  recovery_cleanup_release="$(cat "$recovery_cleanup_root/active-release")"
  snapshot_state "$recovery_cleanup_root" "$test_root/snapshot-recovery-cleanup-$cleanup_step"
  expect_killed_publish "$recovery_cleanup_root" b marker-created
  expect_killed_publish "$recovery_cleanup_root" b "recovery-cleanup-$cleanup_step"
  assert_pre_activation_unchanged "$recovery_cleanup_root" "$test_root/snapshot-recovery-cleanup-$cleanup_step"
  if [ "$cleanup_step" = before-retire ]; then
    assert_recovery_artifacts "$recovery_cleanup_root" >/dev/null
  elif [ "$cleanup_step" = workspace-mid ]; then
    [ -z "$(find_recovery_workspace "$recovery_cleanup_root")" ] || die "workspace-mid cleanup left an authoritative transaction"
  else
    assert_cleanup_only_workspace "$recovery_cleanup_root" >/dev/null
  fi
  expect_publish_failure "$recovery_cleanup_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
  assert_pre_activation_unchanged "$recovery_cleanup_root" "$test_root/snapshot-recovery-cleanup-$cleanup_step"
  assert_restored_authorities "$recovery_cleanup_root" "$recovery_cleanup_release"
  assert_no_workspace "$recovery_cleanup_root"
done

# The EXIT trap uses the identical retirement and cleanup state machine after a
# rollback-triggering failure. SIGKILL at equivalent boundaries must therefore
# have the same authoritative-before-retire and cleanup-only-after-retire shape.
for cleanup_step in before-retire after-retire previous-current metadata workspace-mid; do
  exit_cleanup_root="$test_root/exit-cleanup-$cleanup_step"
  publish_to "$exit_cleanup_root" a
  exit_cleanup_release="$(cat "$exit_cleanup_root/active-release")"
  snapshot_state "$exit_cleanup_root" "$test_root/snapshot-exit-cleanup-$cleanup_step"
  if publish_to "$exit_cleanup_root" b \
    WEB_RELEASE_TEST_FAIL_STEP=before-metadata \
    "WEB_RELEASE_TEST_KILL_STEP=exit-cleanup-$cleanup_step" 2>/dev/null; then
    die "EXIT cleanup SIGKILL unexpectedly succeeded at $cleanup_step"
  fi
  assert_pre_activation_unchanged "$exit_cleanup_root" "$test_root/snapshot-exit-cleanup-$cleanup_step"
  if [ "$cleanup_step" = before-retire ]; then
    assert_recovery_artifacts "$exit_cleanup_root" >/dev/null
  elif [ "$cleanup_step" = workspace-mid ]; then
    [ -z "$(find_recovery_workspace "$exit_cleanup_root")" ] || die "EXIT workspace-mid cleanup left an authoritative transaction"
  else
    assert_cleanup_only_workspace "$exit_cleanup_root" >/dev/null
  fi
  expect_publish_failure "$exit_cleanup_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
  assert_pre_activation_unchanged "$exit_cleanup_root" "$test_root/snapshot-exit-cleanup-$cleanup_step"
  assert_restored_authorities "$exit_cleanup_root" "$exit_cleanup_release"
  assert_no_workspace "$exit_cleanup_root"
done

# Normal immutable-version staging is private too: a mid-copy SIGKILL leaves no
# partial versions entry, and the next publisher removes the abandoned workspace
# before publishing the same release successfully.
publish_copy_root="$test_root/publish-copy-mid"
publish_to "$publish_copy_root" a
expect_killed_publish "$publish_copy_root" b publish-copy-mid
publish_to "$publish_copy_root" b
grep -Fq 'index-b.js' "$publish_copy_root/current/index.html" || die "publish staging recovery did not activate B"
assert_restored_authorities "$publish_copy_root" "$(cat "$publish_copy_root/active-release")"
assert_no_workspace "$publish_copy_root"

# SIGKILL cannot run a trap. The kernel releases flock, and the next publisher
# uses the durable activation marker to recover A before doing any new work.
crash_root="$test_root/activation-crash"
publish_to "$crash_root" a
snapshot_state "$crash_root" "$test_root/snapshot-activation-crash"
if publish_to "$crash_root" b WEB_RELEASE_TEST_FAIL_STEP=activation-crash 2>/dev/null; then
  die "injected activation crash unexpectedly succeeded"
fi
expect_publish_failure "$crash_root" b WEB_RELEASE_TEST_FAIL_STEP=prospective-current
assert_pre_activation_unchanged "$crash_root" "$test_root/snapshot-activation-crash"
[ -z "$(find "$crash_root" -maxdepth 1 -name '.publish-run.*' -print -quit)" ] || die "interrupted workspace was not recovered"

# Two publishers use the lock in the shared release root. The second begins only
# after the first owns the lock, then waits and publishes deterministically.
concurrent_root="$test_root/concurrent"
publish_to "$concurrent_root" a WEB_RELEASE_TEST_LOCK_HOLD_SECONDS=2 &
first_pid=$!
wait_count=0
while [ -z "$(find "$concurrent_root" -maxdepth 1 -name '.publish-run.*' -type d -print -quit 2>/dev/null)" ]; do
  [ "$wait_count" -lt 50 ] || die "first publisher did not acquire the lock"
  sleep 0.1
  wait_count=$((wait_count + 1))
done
publish_to "$concurrent_root" b WEB_RELEASE_LOCK_TIMEOUT=5 &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
[ "$(cat "$concurrent_root/active-release")" = "$(tail -n 1 "$concurrent_root/release-order")" ] || die "concurrent active release is inconsistent"
grep -Fq 'index-b.js' "$concurrent_root/current/index.html" || die "second concurrent publisher did not activate"
[ "$(wc -l < "$concurrent_root/release-order" | tr -d ' ')" = 2 ] || die "concurrent publication lost release metadata"
[ -f "$concurrent_root/current/assets/index-a.js" ] || die "concurrent publication lost A asset"
[ -f "$concurrent_root/current/assets/index-b.js" ] || die "concurrent publication lost B asset"
[ -z "$(find "$concurrent_root" -maxdepth 1 -name '.publish-run.*' -print -quit)" ] || die "run-unique workspace was not cleaned"

# A bounded waiter fails without disturbing the publisher that owns the lock.
timeout_root="$test_root/timeout"
publish_to "$timeout_root" a WEB_RELEASE_TEST_LOCK_HOLD_SECONDS=2 &
holder_pid=$!
wait_count=0
while [ -z "$(find "$timeout_root" -maxdepth 1 -name '.publish-run.*' -type d -print -quit 2>/dev/null)" ]; do
  [ "$wait_count" -lt 50 ] || die "timeout test publisher did not acquire the lock"
  sleep 0.1
  wait_count=$((wait_count + 1))
done
expect_publish_failure "$timeout_root" b WEB_RELEASE_LOCK_TIMEOUT=0
wait "$holder_pid"

# Normal A -> B activation retains both immutable assets and selects B's shell.
retention_root="$test_root/retention"
publish_to "$retention_root" a
release_a="$(cat "$retention_root/active-release")"
publish_to "$retention_root" b
release_b="$(cat "$retention_root/active-release")"
[ "$release_a" != "$release_b" ] || die "A and B received the same release ID"
[ -f "$retention_root/current/assets/index-a.js" ] || die "A asset was not retained"
[ -f "$retention_root/current/assets/index-b.js" ] || die "B asset is missing"
grep -Fq 'index-b.js' "$retention_root/current/index.html" || die "B shell is not current"
grep -Fq 'release="b"' "$retention_root/current/sw.js" || die "B service worker is not current"

# Re-running the publisher simulates proxy recreation against the persistent
# store; both current and previous assets must survive unchanged.
publish_to "$retention_root" b
[ -f "$retention_root/current/assets/index-a.js" ] || die "proxy recreation lost A asset"
[ -f "$retention_root/current/assets/index-b.js" ] || die "proxy recreation lost B asset"
[ "$(cat "$retention_root/active-release")" = "$release_b" ] || die "proxy recreation changed active release"

# A valid retained rollback works. Unknown, pruned, or out-of-window selectors
# fail before a path is resolved or current is changed.
publish_to "$retention_root" b "WEB_ACTIVE_RELEASE=$release_a"
[ "$(cat "$retention_root/active-release")" = "$release_a" ] || die "valid rollback did not activate A"
grep -Fq 'index-a.js' "$retention_root/current/index.html" || die "rollback did not select A shell"
snapshot_state "$retention_root" "$test_root/snapshot-active-prune"
expect_publish_failure "$retention_root" c "WEB_ACTIVE_RELEASE=$release_a"
assert_pre_activation_unchanged "$retention_root" "$test_root/snapshot-active-prune"

# Activate C normally: retention stays bounded and A is no longer permitted.
publish_to "$retention_root" c
release_c="$(cat "$retention_root/active-release")"
[ "$(find "$retention_root/versions" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = 2 ] || die "retention is not bounded"
[ ! -d "$retention_root/versions/$release_a" ] || die "A was not pruned"
[ -d "$retention_root/versions/$release_b" ] || die "rollback release B was pruned"
[ -d "$retention_root/versions/$release_c" ] || die "active release C was pruned"
expect_publish_failure "$retention_root" c "WEB_ACTIVE_RELEASE=$release_a"
expect_publish_failure "$retention_root" c WEB_ACTIVE_RELEASE=sha256-0000000000000000

# A prune failure happens after activation and metadata commit. It may leave an
# extra version directory, but cannot corrupt the served tree or its metadata.
prune_root="$test_root/prune"
publish_to "$prune_root" a
publish_to "$prune_root" b
oldest_id="$(head -n 1 "$prune_root/release-order")"
expect_publish_failure "$prune_root" c WEB_RELEASE_TEST_FAIL_STEP=prune
grep -Fq 'index-c.js' "$prune_root/current/index.html" || die "post-activation prune failure rolled back current"
[ "$(cat "$prune_root/current/.release-id")" = "$(cat "$prune_root/active-release")" ] || die "prune failure corrupted active metadata"
[ "$(tail -n 1 "$prune_root/release-order")" = "$(cat "$prune_root/active-release")" ] || die "prune failure corrupted release-order"
[ -d "$prune_root/versions/$oldest_id" ] || die "injected prune failure unexpectedly removed the old version"

# Exact release-ID validation rejects traversal, separators, whitespace,
# absolute paths, uppercase/malformed hashes, and unexpected prefixes.
validation_root="$test_root/validation"
publish_to "$validation_root" a
for invalid_id in \
  . .. ../x '..\x' /absolute sha256/0000000000000000 \
  ' sha256-0000000000000000' 'sha256-0000000000000000 ' \
  sha256-000000000000000 sha256-00000000000000000 \
  sha256-000000000000000G SHA256-0000000000000000 md5-0000000000000000; do
  assert_rejected_id "$validation_root" "$invalid_id"
done

cp "$validation_root/active-release" "$test_root/valid-active"
printf '../x\n' > "$validation_root/active-release"
expect_publish_failure "$validation_root" b
cp "$test_root/valid-active" "$validation_root/active-release"
cp "$validation_root/release-order" "$test_root/valid-order"
printf 'sha256-0000000000000000\n../x\n' > "$validation_root/release-order"
expect_publish_failure "$validation_root" b
cp "$test_root/valid-order" "$validation_root/release-order"
mkdir "$validation_root/versions/not-a-release"
expect_publish_failure "$validation_root" b
rmdir "$validation_root/versions/not-a-release"

# Exercise the actual Caddy routing rules when the test runs in the proxy image.
# This proves MIME/status behavior, cache policy, navigation fallback, and current sw.js.
command -v caddy >/dev/null 2>&1 || die "caddy is required for the HTTP asset-retention regression"
[ -f "$caddyfile" ] || die "Caddyfile not found at $caddyfile"
http_root="$test_root/http-releases"
publish_to "$http_root" a
publish_to "$http_root" b
sed "s#/srv/releases/current#$http_root/current#g" "$caddyfile" > "$test_root/Caddyfile"
PUBLIC_HOSTNAME=http://127.0.0.1:18089 caddy run --config "$test_root/Caddyfile" --adapter caddyfile >"$test_root/caddy.log" 2>&1 &
caddy_pid=$!
ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if wget -q -O "$test_root/index-response" http://127.0.0.1:18089/ 2>/dev/null; then ready=1; break; fi
  sleep 0.2
done
[ "$ready" -eq 1 ] || die "Caddy did not start for HTTP regression"

wget -S -O "$test_root/b-response" http://127.0.0.1:18089/assets/index-b.js 2>"$test_root/b-headers"
grep -Eiq 'Content-Type: *text/javascript' "$test_root/b-headers" || die "B asset MIME type is not text/javascript"
grep -Eiq 'Cache-Control:.*max-age=31536000' "$test_root/b-headers" || die "B asset is missing one-year cache policy"
grep -Eiq 'Cache-Control:.*immutable' "$test_root/b-headers" || die "B asset is missing immutable cache policy"
grep -Fq 'console.log("b")' "$test_root/b-response" || die "B asset response is incorrect"
wget -S -O "$test_root/a-response" http://127.0.0.1:18089/assets/index-a.js 2>"$test_root/a-headers"
grep -Eiq 'Content-Type: *text/javascript' "$test_root/a-headers" || die "A asset MIME type is not text/javascript"
grep -Eiq 'Cache-Control:.*max-age=31536000' "$test_root/a-headers" || die "A previous asset is missing one-year cache policy"
grep -Eiq 'Cache-Control:.*immutable' "$test_root/a-headers" || die "A previous asset is missing immutable cache policy"
grep -Fq 'console.log("a")' "$test_root/a-response" || die "A previous asset response is incorrect"
if wget -q -O "$test_root/missing-response" http://127.0.0.1:18089/assets/index-missinghash.js 2>/dev/null; then
  die "nonexistent hashed asset did not return 404"
fi
[ -f "$test_root/missing-response" ] || : > "$test_root/missing-response"
grep -Fq '<!doctype html>' "$test_root/missing-response" && die "nonexistent hashed asset received index.html"
wget -S -O "$test_root/index-cache-response" http://127.0.0.1:18089/ 2>"$test_root/index-headers"
grep -Eiq 'Cache-Control: *no-cache' "$test_root/index-headers" || die "index HTML is missing no-cache policy"
wget -S -O "$test_root/navigation-response" http://127.0.0.1:18089/a/navigation/path 2>"$test_root/navigation-headers"
grep -Eiq 'Cache-Control: *no-cache' "$test_root/navigation-headers" || die "navigation HTML is missing no-cache policy"
grep -Fq 'index-b.js' "$test_root/navigation-response" || die "navigation did not receive current shell"
wget -S -O "$test_root/sw-response" http://127.0.0.1:18089/sw.js 2>"$test_root/sw-headers"
grep -Eiq 'Cache-Control: *no-cache' "$test_root/sw-headers" || die "sw.js is missing no-cache policy"
grep -Fq 'release="b"' "$test_root/sw-response" || die "sw.js is not the current service worker"

echo "PASS: atomic markers, cleanup retirement, locking, durable recovery, strict IDs, rollback, bounded retention, restart retention, and HTTP/cache routing"
