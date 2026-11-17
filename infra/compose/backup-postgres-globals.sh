#!/bin/bash -p
set -euo pipefail

if [[ $- != *p* ]]; then
  builtin printf '%s\n' 'PostgreSQL globals backup is disabled: invoke /bin/bash -p in a clean environment.' >&2
  exit 1
fi

if [[ $# -eq 1 && "$1" == "--help" ]]; then
  while IFS= read -r line; do
    builtin printf '%s\n' "$line"
  done <<'EOF'
PostgreSQL globals backup candidate: DISABLED.

Use the trusted direct executable entry point, or invoke /bin/bash -p explicitly.
If invoked explicitly with bash without -p, Bash may execute BASH_ENV before
this script starts; this script cannot prevent that startup execution.

No database connection or backup is permitted until the database endpoint,
server identity, read-only authorization, output isolation, and restore process
have been implemented and independently verified.

The intended design must stream pg_dumpall --globals-only directly into age,
including role password hashes in the encrypted output. It must use explicit
recipients, reject overwrite, enforce an output size limit and independently
isolated capacity, and report every failure. Plaintext, password hashes, and
credentials must never be written to files or logs. A successful backup would
still require isolated decryption and restore tests. None of these backup or
restore capabilities is implemented here.

Synthetic rehearsal design, not an executable mode:
- Run only on sydney-backend-admin with trusted host and Docker daemon identity.
  Create source and target clusters specifically for the rehearsal; never
  accept an existing container, database endpoint, volume or data directory.
  Pin a locally available PostgreSQL image by digest and never pull it.
- Provision a disposable PostgreSQL cluster with synthetic roles and passwords
  in a separately verified network namespace without network interfaces; use
  only its private Unix socket, with a fresh data directory and clean libpq
  environment. Verify process, socket, data directory and server identity
  belong to that cluster before allowing a connection. A name or environment
  variable alone cannot prove isolation.
- Generate a disposable age identity and supply its public recipient explicitly.
  Stream pg_dumpall --globals-only into age without plaintext files, retaining
  role password hashes. Suppress or sanitize both processes' diagnostics.
- Fail unless both processes exit successfully. Handle startup failure, broken
  pipes, signals, timeouts, size limits, full storage and cleanup failure; reap
  both processes and remove incomplete ciphertext without overwriting an
  existing file. A killed process or failed cleanup can leave ciphertext.
- Use a private exclusive output with a ciphertext limit and independently
  enforced storage isolation. Decrypt and restore only into a second disposable,
  isolated cluster; verify synthetic roles and password hashes and test both
  producer and encryptor failures. Destroy disposable keys and clusters.
- Separately capture a database archive with ownership and privileges included.
  Restore globals before the database archive, stop on every SQL or restore
  error, and explicitly handle the already-existing bootstrap role without
  silently discarding its attributes or grants. Do not import globals into
  the maintenance host's existing cluster. Never print decrypted data or hashes.
- Verify roles, attributes, memberships, password authentication, database and
  object owners, schema and object grants, default privileges, and actual
  allowed and denied access. Include an archive made without privileges as a
  negative control and prove its missing ACLs cannot be supplied by globals.
  Independently captured globals and database archives are not an atomic
  snapshot; concurrent role or grant changes can make them inconsistent.
- Verify isolation and identity before and after each sensitive operation;
  bound time, memory and storage, check cleanup and report unknown outcomes.
  Exercise failures, interruption and cleanup; do not claim secure erasure.

No isolation, encryption, failure handling, or recovery has been verified by
this script. Memory, swap, privileged observers and child executables remain
outside its control. This design does not authorize production collection.
EOF
  exit 0
fi

printf '%s\n' 'PostgreSQL globals backup is disabled: database identity and recovery are not verified.' >&2
exit 1
