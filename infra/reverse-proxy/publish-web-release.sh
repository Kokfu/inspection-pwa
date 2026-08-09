#!/bin/sh
set -eu

image_root="${WEB_IMAGE_ROOT:-/srv/image-release}"
release_root="${WEB_RELEASE_ROOT:-/srv/releases}"
retention="${WEB_RELEASE_RETENTION:-2}"
requested_active="${WEB_ACTIVE_RELEASE:-}"
lock_timeout="${WEB_RELEASE_LOCK_TIMEOUT:-30}"
test_failure="${WEB_RELEASE_TEST_FAIL_STEP:-}"
test_recovery_failure="${WEB_RELEASE_TEST_FAIL_RECOVERY_STEP:-}"
test_kill_step="${WEB_RELEASE_TEST_KILL_STEP:-}"
test_lock_hold="${WEB_RELEASE_TEST_LOCK_HOLD_SECONDS:-0}"
releases_dir="$release_root/versions"
order_file="$release_root/release-order"
active_file="$release_root/active-release"
lock_file="$release_root/.publisher.lock"
release_hex_length=16

fail() {
  echo "web release publish failed: $*" >&2
  exit 1
}

is_uint() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
}

is_release_id() {
  candidate_id="$1"
  case "$candidate_id" in
    sha256-*) candidate_hash="${candidate_id#sha256-}" ;;
    *) return 1 ;;
  esac
  [ "${#candidate_hash}" -eq "$release_hex_length" ] || return 1
  case "$candidate_hash" in
    *[!0-9a-f]*) return 1 ;;
  esac
}

test_fail_at() {
  [ "$test_failure" != "$1" ] || fail "injected $1 failure"
}

test_kill_at() {
  [ "$test_kill_step" != "$1" ] || kill -KILL "$$"
}

is_workspace_name() {
  workspace_name="$1"
  case "$workspace_name" in
    .publish-run.????????) ;;
    *) return 1 ;;
  esac
  workspace_suffix="${workspace_name#.publish-run.}"
  case "$workspace_suffix" in
    *[!0-9A-Za-z]*) return 1 ;;
  esac
}

validate_release_tree() {
  tree="$1"
  description="$2"
  [ -f "$tree/index.html" ] || fail "$description is missing index.html"
  [ -f "$tree/sw.js" ] || fail "$description is missing sw.js"
  [ -d "$tree/assets" ] || fail "$description is missing the assets directory"
}

case "$test_failure" in
  ''|source-copy|prospective-current|marker-crash|activation|activation-crash|before-metadata|after-active-release|prune) ;;
  *) fail "WEB_RELEASE_TEST_FAIL_STEP is invalid" ;;
esac
case "$test_recovery_failure" in
  ''|preserved|current|metadata) ;;
  *) fail "WEB_RELEASE_TEST_FAIL_RECOVERY_STEP is invalid" ;;
esac
case "$test_kill_step" in
  ''|workspace-created|workspace-initialized|marker-created|marker-pre-temp|marker-temp-writing|marker-temp-prepared|marker-pre-rename|marker-post-rename|recovery-copy-start|recovery-copy-mid|recovery-copy-copied|recovery-copy-validated|recovery-copy-renamed|activation-current|recovery-current|recovery-metadata|publish-copy-mid|recovery-cleanup-before-retire|recovery-cleanup-after-retire|recovery-cleanup-previous-current|recovery-cleanup-metadata|recovery-cleanup-workspace-mid|exit-cleanup-before-retire|exit-cleanup-after-retire|exit-cleanup-previous-current|exit-cleanup-metadata|exit-cleanup-workspace-mid) ;;
  *) fail "WEB_RELEASE_TEST_KILL_STEP is invalid" ;;
esac
is_uint "$retention" || fail "WEB_RELEASE_RETENTION must be an integer of at least 2"
[ "$retention" -ge 2 ] || fail "WEB_RELEASE_RETENTION must be at least 2"
is_uint "$lock_timeout" || fail "WEB_RELEASE_LOCK_TIMEOUT must be a non-negative integer"
is_uint "$test_lock_hold" || fail "WEB_RELEASE_TEST_LOCK_HOLD_SECONDS must be a non-negative integer"
[ -z "$requested_active" ] || is_release_id "$requested_active" || \
  fail "WEB_ACTIVE_RELEASE must match sha256- followed by $release_hex_length lowercase hex characters"

# Validate and identify the immutable image before touching persistent metadata.
validate_release_tree "$image_root" "image release"
image_digest="$({ find "$image_root" -type f -exec sha256sum {} \; | sed "s#$image_root/##" | sort; } | sha256sum | cut -c1-$release_hex_length)"
image_release_id="sha256-$image_digest"
is_release_id "$image_release_id" || fail "generated an invalid image release ID"

mkdir -p "$release_root"
run_dir=""
activation_started=0
transaction_committed=0
# Before activation, the persistent release state is already consistent and no
# rollback is required. Entering activation clears this flag; it is set again
# only after the complete previous state has been restored and verified.
rollback_completed=1
had_current=0
had_order=0
had_active=0

recovery_error() {
  echo "web release recovery failed: $*" >&2
  return 1
}

durable_sync() {
  sync -f "$1" 2>/dev/null || sync
}

marker_value_is_valid() {
  marker_value="$1"
  [ "$marker_value" = none ] || is_release_id "$marker_value"
}

validate_marker_file() {
  marker_file="$1"
  [ -f "$marker_file" ] || return 1
  [ "$(wc -l < "$marker_file" | tr -d ' ')" = 1 ] || return 1
  validated_marker_value="$(cat "$marker_file")" || return 1
  marker_value_is_valid "$validated_marker_value"
}

publish_activation_marker() {
  marker_run="$1"
  marker_value_to_publish="$2"
  marker_temp="$marker_run/activation-pending.preparing"
  marker_final="$marker_run/activation-pending"

  marker_value_is_valid "$marker_value_to_publish" || fail "refusing to publish an invalid activation marker"
  [ ! -e "$marker_final" ] || fail "activation marker already exists"
  rm -f "$marker_temp"
  test_kill_at marker-pre-temp
  if [ "$test_kill_step" = marker-temp-writing ]; then
    case "$marker_value_to_publish" in
      none) printf 'n' > "$marker_temp" ;;
      *) printf 'sha256-' > "$marker_temp" ;;
    esac
    test_kill_at marker-temp-writing
  fi
  printf '%s\n' "$marker_value_to_publish" > "$marker_temp"
  test_kill_at marker-temp-prepared
  validate_marker_file "$marker_temp" || fail "prepared activation marker is invalid"
  [ "$validated_marker_value" = "$marker_value_to_publish" ] || fail "prepared activation marker has the wrong value"
  durable_sync "$marker_temp"
  test_kill_at marker-pre-rename
  mv "$marker_temp" "$marker_final"
  test_kill_at marker-post-rename
  durable_sync "$marker_run"
}

tree_matches_release() {
  candidate_tree="$1"
  candidate_release="$2"
  [ -f "$candidate_tree/index.html" ] &&
    [ -f "$candidate_tree/sw.js" ] &&
    [ -d "$candidate_tree/assets" ] &&
    [ -f "$candidate_tree/.release-id" ] &&
    [ "$(cat "$candidate_tree/.release-id")" = "$candidate_release" ]
}

release_tree_digest() {
  digest_tree="$1"
  (
    cd "$digest_tree"
    find . -type f ! -path './.publisher-tree-complete' -exec sha256sum {} \; | sort
  ) | sha256sum | cut -d ' ' -f 1
}

completion_value() {
  completion_tree="$1"
  completion_release="$2"
  printf '%s:%s\n' "$completion_release" "$(release_tree_digest "$completion_tree")"
}

previous_current_is_complete() {
  candidate_run="$1"
  candidate_release="$2"
  [ -d "$candidate_run/previous-current" ] &&
    [ ! -L "$candidate_run/previous-current" ] &&
    [ -f "$candidate_run/previous-current/.publisher-tree-complete" ] &&
    [ "$(cat "$candidate_run/previous-current/.publisher-tree-complete")" = "$(completion_value "$candidate_run/previous-current" "$candidate_release")" ] &&
    tree_matches_release "$candidate_run/previous-current" "$candidate_release"
}

preserve_still_current() {
  recovery_run="$1"
  recovery_previous="$2"
  recovery_stage="$recovery_run/previous-current.staging"

  # An authoritative previous-current requires both a valid release tree and
  # its exact completion marker. A directory left by an older interrupted copy
  # is never trusted merely because it exists.
  if previous_current_is_complete "$recovery_run" "$recovery_previous"; then
    rm -rf "$recovery_stage"
    return 0
  fi

  tree_matches_release "$release_root/current" "$recovery_previous" || {
    recovery_error "previous current is incomplete and current is not the intact prior release"
    return 1
  }

  # current remains the final known-good source until a complete staged copy is
  # validated. Only workspace-owned incomplete destinations are discarded.
  rm -rf "$recovery_stage" "$recovery_run/previous-current" || {
    recovery_error "could not discard incomplete previous-current staging"
    return 1
  }
  mkdir "$recovery_stage" || {
    recovery_error "could not create previous-current staging"
    return 1
  }
  test_kill_at recovery-copy-start
  if [ "$test_kill_step" = recovery-copy-mid ]; then
    cp -a "$release_root/current/index.html" "$recovery_stage/" || return 1
    test_kill_at recovery-copy-mid
  fi
  cp -a "$release_root/current/." "$recovery_stage/" || {
    recovery_error "could not stage still-current prior release"
    return 1
  }
  test_kill_at recovery-copy-copied
  tree_matches_release "$recovery_stage" "$recovery_previous" || {
    recovery_error "staged previous current failed validation"
    return 1
  }
  completion_value "$recovery_stage" "$recovery_previous" > "$recovery_stage/.publisher-tree-complete" || {
    recovery_error "could not mark staged previous current complete"
    return 1
  }
  test_kill_at recovery-copy-validated
  mv "$recovery_stage" "$recovery_run/previous-current" || {
    recovery_error "could not atomically install previous current"
    return 1
  }
  test_kill_at recovery-copy-renamed
  previous_current_is_complete "$recovery_run" "$recovery_previous" || {
    recovery_error "installed previous current is incomplete"
    return 1
  }
}

restore_transaction() {
  recovery_run="$1"
  validate_marker_file "$recovery_run/activation-pending" || {
    recovery_error "activation marker is missing or invalid"
    return 1
  }
  recovery_previous="$validated_marker_value"

  if [ "$recovery_previous" = none ]; then
    rm -rf "$release_root/current" || {
      recovery_error "could not remove interrupted initial current tree"
      return 1
    }
    [ "$test_recovery_failure" != current ] || {
      recovery_error "injected current-tree restoration failure"
      return 1
    }
    rm -f "$order_file" "$active_file" || {
      recovery_error "could not remove interrupted initial metadata"
      return 1
    }
    [ ! -e "$release_root/current" ] && [ ! -e "$order_file" ] && [ ! -e "$active_file" ] || {
      recovery_error "interrupted initial publication was not fully removed"
      return 1
    }
    return 0
  fi

  is_release_id "$recovery_previous" || {
    recovery_error "activation marker contains an invalid prior release ID"
    return 1
  }
  [ -f "$recovery_run/previous-release-order" ] || {
    recovery_error "release-order backup is missing"
    return 1
  }
  [ -f "$recovery_run/previous-active-release" ] || {
    recovery_error "active-release backup is missing"
    return 1
  }
  [ "$(cat "$recovery_run/previous-active-release")" = "$recovery_previous" ] || {
    recovery_error "active-release backup has the wrong release ID"
    return 1
  }
  grep -Fxq "$recovery_previous" "$recovery_run/previous-release-order" || {
    recovery_error "release-order backup does not retain the prior release"
    return 1
  }

  # A crash can land after activation-pending is durable but before current is
  # moved aside. Preserve that still-current prior release through a private
  # staging tree; only a validated atomic rename can create previous-current.
  preserve_still_current "$recovery_run" "$recovery_previous" || return 1
  [ "$test_recovery_failure" != preserved ] || {
    recovery_error "injected post-preservation recovery failure"
    return 1
  }

  # Keep previous-current as the last known-good source until the restored tree
  # and both metadata files have all been verified. A partial copy is disposable
  # on the next idempotent recovery attempt; the recovery source is not.
  rm -rf "$release_root/current" || {
    recovery_error "could not remove interrupted current tree"
    return 1
  }
  [ "$test_recovery_failure" != current ] || {
    recovery_error "injected current-tree restoration failure"
    return 1
  }
  cp -a "$recovery_run/previous-current" "$release_root/current" || {
    recovery_error "could not restore previous current tree"
    return 1
  }
  test_kill_at recovery-current
  [ "$test_recovery_failure" != metadata ] || {
    recovery_error "injected metadata restoration failure"
    return 1
  }
  cp "$recovery_run/previous-release-order" "$order_file" || {
    recovery_error "could not restore release-order"
    return 1
  }
  test_kill_at recovery-metadata
  cp "$recovery_run/previous-active-release" "$active_file" || {
    recovery_error "could not restore active-release"
    return 1
  }

  validate_release_tree "$release_root/current" "restored current tree" || return 1
  [ "$(cat "$release_root/current/.release-id")" = "$recovery_previous" ] || {
    recovery_error "restored current tree has the wrong release ID"
    return 1
  }
  cmp "$recovery_run/previous-release-order" "$order_file" >/dev/null || {
    recovery_error "restored release-order does not match its backup"
    return 1
  }
  cmp "$recovery_run/previous-active-release" "$active_file" >/dev/null || {
    recovery_error "restored active-release does not match its backup"
    return 1
  }
  [ "$(cat "$active_file")" = "$recovery_previous" ] || {
    recovery_error "restored active-release does not describe current"
    return 1
  }
  grep -Fxq "$recovery_previous" "$order_file" || {
    recovery_error "restored release-order does not retain current"
    return 1
  }
}

retire_activation_marker() {
  cleanup_run="$1"
  cleanup_prefix="$2"
  cleanup_marker="$cleanup_run/cleanup-only"

  [ ! -e "$cleanup_marker" ] || {
    recovery_error "cleanup marker already exists beside an authoritative activation marker"
    return 1
  }
  validate_marker_file "$cleanup_run/activation-pending" || {
    recovery_error "cannot retire a missing or invalid activation marker"
    return 1
  }
  test_kill_at "$cleanup_prefix-before-retire"
  mv "$cleanup_run/activation-pending" "$cleanup_marker" || {
    recovery_error "could not atomically retire activation marker"
    return 1
  }
  test_kill_at "$cleanup_prefix-after-retire"
  durable_sync "$cleanup_run"
  validate_marker_file "$cleanup_marker" || {
    recovery_error "retired cleanup marker is invalid"
    return 1
  }
}

cleanup_workspace() {
  cleanup_run="$1"
  cleanup_prefix="$2"

  if [ -f "$cleanup_run/activation-pending" ]; then
    retire_activation_marker "$cleanup_run" "$cleanup_prefix" || return 1
  elif [ -e "$cleanup_run/cleanup-only" ]; then
    validate_marker_file "$cleanup_run/cleanup-only" || {
      recovery_error "cleanup-only workspace has an invalid retired marker"
      return 1
    }
  fi

  # This check is the destructive-cleanup gate. No recovery source or metadata
  # backup is removed while activation-pending remains authoritative.
  [ ! -e "$cleanup_run/activation-pending" ] || {
    recovery_error "refusing cleanup while activation marker is authoritative"
    return 1
  }

  if [ "$test_kill_step" = "$cleanup_prefix-previous-current" ]; then
    rm -f "$cleanup_run/previous-current/index.html"
    test_kill_at "$cleanup_prefix-previous-current"
  fi
  rm -rf "$cleanup_run/previous-current" "$cleanup_run/previous-current.staging" || return 1

  if [ "$test_kill_step" = "$cleanup_prefix-metadata" ]; then
    rm -f "$cleanup_run/previous-release-order"
    test_kill_at "$cleanup_prefix-metadata"
  fi
  rm -f "$cleanup_run/previous-release-order" "$cleanup_run/previous-active-release" || return 1

  if [ "$test_kill_step" = "$cleanup_prefix-workspace-mid" ]; then
    rm -f "$cleanup_run/cleanup-only" "$cleanup_run/workspace-initialized"
    test_kill_at "$cleanup_prefix-workspace-mid"
  fi
  rm -rf "$cleanup_run"
}

cleanup() {
  cleanup_status=$?
  trap - EXIT

  if [ -n "$run_dir" ] && [ -d "$run_dir" ]; then
    if [ "$transaction_committed" -eq 1 ]; then
      cleanup_workspace "$run_dir" commit-cleanup || cleanup_status=1
    elif [ "$rollback_completed" -eq 1 ]; then
      cleanup_workspace "$run_dir" exit-cleanup || cleanup_status=1
    elif [ "$activation_started" -eq 1 ] && restore_transaction "$run_dir"; then
      rollback_completed=1
      cleanup_workspace "$run_dir" exit-cleanup || cleanup_status=1
    else
      echo "web release recovery remains unresolved; preserving $run_dir" >&2
      cleanup_status=1
    fi
  fi

  exit "$cleanup_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# The lock file is itself persistent, but the kernel lock is released
# automatically if the publisher or its container dies.
exec 9>"$lock_file"
waited=0
until flock -n 9; do
  [ "$waited" -lt "$lock_timeout" ] || fail "timed out waiting for the shared release publisher lock"
  sleep 1
  waited=$((waited + 1))
done

mkdir -p "$releases_dir"
# Ownership is inherent in the strict root-level namespace. There is no period
# after mkdir in which a workspace depends on a later marker to be recognized.
run_dir="$(mktemp -d "$release_root/.publish-run.XXXXXXXX")"
is_workspace_name "${run_dir##*/}" || fail "mktemp created an invalid publisher workspace name"
test_kill_at workspace-created
[ "$test_lock_hold" -eq 0 ] || sleep "$test_lock_hold"
publish_stage="$run_dir/version"
serve_stage="$run_dir/prospective-current"
prospective_order="$run_dir/prospective-release-order"
keep_file="$run_dir/retained-release-order"
active_stage="$run_dir/active-release"
image_release_dir="$releases_dir/$image_release_id"
touch "$run_dir/workspace-initialized"
test_kill_at workspace-initialized

# A killed container can interrupt the two-rename current-directory swap. The
# next lock owner repairs any such transaction before reading authoritative
# metadata or starting Caddy. Non-transaction workspaces contain only private
# staging and are safe to discard once their kernel lock has been released.
for abandoned_run in "$release_root"/.publish-run.*; do
  if [ ! -e "$abandoned_run" ] && [ ! -L "$abandoned_run" ]; then continue; fi
  [ "$abandoned_run" != "$run_dir" ] || continue
  abandoned_name="${abandoned_run##*/}"
  is_workspace_name "$abandoned_name" || fail "found a malformed publisher workspace name"
  [ -d "$abandoned_run" ] && [ ! -L "$abandoned_run" ] || fail "publisher workspace is not a real directory"
  [ ! -e "$abandoned_run/activation-pending" ] || [ ! -e "$abandoned_run/cleanup-only" ] || \
    fail "publisher workspace has conflicting recovery and cleanup markers"
  if [ -f "$abandoned_run/activation-pending" ]; then
    restore_transaction "$abandoned_run" || \
      fail "could not complete recovery of interrupted publication $abandoned_run"
  fi
  cleanup_workspace "$abandoned_run" recovery-cleanup || \
    fail "could not clean interrupted publisher workspace $abandoned_run"
done

# Validate every persistent identifier before using it to form a path.
: > "$run_dir/existing-release-order"
if [ -f "$order_file" ]; then
  had_order=1
  cp "$order_file" "$run_dir/previous-release-order"
  while IFS= read -r ordered_id || [ -n "$ordered_id" ]; do
    is_release_id "$ordered_id" || fail "release-order contains an invalid release ID"
    grep -Fxq "$ordered_id" "$run_dir/existing-release-order" && \
      fail "release-order contains duplicate release $ordered_id"
    printf '%s\n' "$ordered_id" >> "$run_dir/existing-release-order"
  done < "$order_file"
fi

metadata_active=""
if [ -f "$active_file" ]; then
  had_active=1
  cp "$active_file" "$run_dir/previous-active-release"
  metadata_active="$(cat "$active_file")"
  is_release_id "$metadata_active" || fail "active-release contains an invalid release ID"
fi

if [ -d "$release_root/current" ]; then
  had_current=1
  [ -f "$release_root/current/.release-id" ] || fail "current is missing .release-id"
  current_release_id="$(cat "$release_root/current/.release-id")"
  is_release_id "$current_release_id" || fail "current contains an invalid release ID"
  [ -n "$metadata_active" ] || fail "current exists without active-release metadata"
  [ "$current_release_id" = "$metadata_active" ] || fail "active-release does not describe current"
  grep -Fxq "$metadata_active" "$run_dir/existing-release-order" || \
    fail "active-release is not retained by release-order"
elif [ -n "$metadata_active" ] || [ -s "$run_dir/existing-release-order" ]; then
  fail "release metadata exists without a current tree"
fi

# Version-directory names are persistent release identifiers too. Reject an
# unexpected name before any activation rather than discovering it while
# post-commit pruning is already under way.
for stored_release_dir in \
  "$releases_dir"/* \
  "$releases_dir"/.[!.]* \
  "$releases_dir"/..?*; do
  [ -d "$stored_release_dir" ] || continue
  stored_release_id="${stored_release_dir##*/}"
  is_release_id "$stored_release_id" || fail "versions contains an invalid release directory"
done

while IFS= read -r ordered_id; do
  # ordered_id was validated above, before this path is resolved.
  [ -d "$releases_dir/$ordered_id" ] || fail "release-order references missing release $ordered_id"
  validate_release_tree "$releases_dir/$ordered_id" "retained release $ordered_id"
done < "$run_dir/existing-release-order"

if [ -n "$requested_active" ]; then
  grep -Fxq "$requested_active" "$run_dir/existing-release-order" || \
    fail "requested rollback release is not permitted by release-order"
  [ -d "$releases_dir/$requested_active" ] || \
    fail "requested rollback release is not retained under versions"
fi

# Publish the image into an immutable version directory. A failed copy never
# becomes visible under versions because the final rename is on one filesystem.
if [ ! -d "$image_release_dir" ]; then
  mkdir "$publish_stage"
  test_fail_at source-copy
  if [ "$test_kill_step" = publish-copy-mid ]; then
    cp -a "$image_root/index.html" "$publish_stage/"
    test_kill_at publish-copy-mid
  fi
  cp -a "$image_root/." "$publish_stage/"
  validate_release_tree "$publish_stage" "staged release"
  mv "$publish_stage" "$image_release_dir"
else
  validate_release_tree "$image_release_dir" "existing image release"
fi

grep -Fvx "$image_release_id" "$run_dir/existing-release-order" > "$prospective_order" || true
printf '%s\n' "$image_release_id" >> "$prospective_order"
tail -n "$retention" "$prospective_order" > "$keep_file"

active_release_id="$image_release_id"
[ -z "$requested_active" ] || active_release_id="$requested_active"
grep -Fxq "$active_release_id" "$keep_file" || \
  fail "active release is outside the configured retention window"

# Build and validate the complete tree before changing current or metadata.
mkdir "$serve_stage"
cp -a "$releases_dir/$active_release_id/." "$serve_stage/"
mkdir -p "$serve_stage/assets"
while IFS= read -r retained_id; do
  is_release_id "$retained_id" || fail "prospective release-order contains an invalid release ID"
  [ -d "$releases_dir/$retained_id" ] || fail "prospective release $retained_id is missing"
  validate_release_tree "$releases_dir/$retained_id" "prospective release $retained_id"
  cp -a "$releases_dir/$retained_id/assets/." "$serve_stage/assets/"
done < "$keep_file"
cp -a "$releases_dir/$active_release_id/assets/." "$serve_stage/assets/"
printf '%s\n' "$active_release_id" > "$serve_stage/.release-id"
validate_release_tree "$serve_stage" "prospective current tree"
test_fail_at prospective-current

# Prepare metadata, then activate current. Until both metadata files are moved
# into place, the EXIT trap restores the prior tree and prior metadata.
cp "$keep_file" "$run_dir/new-release-order"
printf '%s\n' "$active_release_id" > "$active_stage"
if [ "$had_order" -eq 1 ]; then cp "$order_file" "$run_dir/previous-release-order"; fi
if [ "$had_active" -eq 1 ]; then cp "$active_file" "$run_dir/previous-active-release"; fi

activation_marker_value=none
if [ "$had_current" -eq 1 ]; then
  activation_marker_value="$metadata_active"
  durable_sync "$run_dir/previous-release-order"
  durable_sync "$run_dir/previous-active-release"
  durable_sync "$run_dir"
fi
publish_activation_marker "$run_dir" "$activation_marker_value"

[ "$test_failure" != marker-crash ] || kill -KILL "$$"
test_kill_at marker-created
activation_started=1
rollback_completed=0
if [ "$had_current" -eq 1 ]; then
  completion_value "$release_root/current" "$metadata_active" > "$run_dir/previous-current-complete"
  mv "$run_dir/previous-current-complete" "$release_root/current/.publisher-tree-complete"
  mv "$release_root/current" "$run_dir/previous-current"
fi
test_fail_at activation
if ! mv "$serve_stage" "$release_root/current"; then
  fail "could not activate release $active_release_id"
fi
test_kill_at activation-current
[ "$test_failure" != activation-crash ] || kill -KILL "$$"
test_fail_at before-metadata
mv "$run_dir/new-release-order" "$order_file"
mv "$active_stage" "$active_file"
test_fail_at after-active-release
transaction_committed=1
touch "$run_dir/transaction-committed"
retire_activation_marker "$run_dir" commit-cleanup
rm -rf "$run_dir/previous-current" "$run_dir/previous-current.staging"
rm -f "$run_dir/previous-release-order" "$run_dir/previous-active-release"

# Pruning is deliberately post-commit. Failure here leaves current and both
# authoritative metadata files describing the successfully activated release.
test_fail_at prune
for release_dir in "$releases_dir"/*; do
  [ -d "$release_dir" ] || continue
  release_id="${release_dir##*/}"
  is_release_id "$release_id" || fail "versions contains an invalid release directory"
  if ! grep -Fxq "$release_id" "$keep_file"; then
    [ "$release_id" != "$active_release_id" ] || fail "refusing to prune the active release"
    rm -rf "$release_dir"
  fi
done

echo "Active web release: $active_release_id (retaining $retention releases)"

# Finish owned cleanup while still locked, then do not let the long-running
# Caddy process inherit the publisher lock.
cleanup_workspace "$run_dir" commit-cleanup
run_dir=""
flock -u 9
exec 9>&-
[ "${1:-}" = "publish-only" ] && exit 0
exec "$@"
