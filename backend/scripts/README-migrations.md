# Migrations

**Rule: never run a migration file by hand again. Use the runner.** It records every run in `schema_migrations` (folder-qualified path, timestamp, duration, sha256), so everyone can see what has and hasn't been applied.

Files live in `migrations/` (PM, 005-042) and `src/migrations/` (helpdesk, 001-017b). The runner sorts both together by numeric prefix (`021 < 021b < 021c < 022`; same number in both folders -> `src/migrations` first) and runs each file unchanged as a child process. Files not starting with a digit (`_verify_*.js`, `seed_*.js`) and `.sql` files are ignored.

Every command prints the target DB and host first. Check it before continuing.

| Command | What it does |
|---|---|
| `npm run migrate:status` | Resolved order with APPLIED / PENDING (and CHANGED if an applied file differs from its recorded checksum). |
| `npm run migrate` | Runs every PENDING file in order. Stops on the first non-zero exit and does not record it. |
| `node scripts/migrate.js up --only 043` | Run one pending file. |
| `npm run migrate:baseline` | Marks all files as applied WITHOUT running them. Refuses if the table has rows (`--force` to override). |
| `node scripts/migrate.js verify` | Warns if a recorded migration no longer exists on disk. |

**Local / UAT:** already baselined (2026-09-13). Add a new file `migrations/043_*.js`, then `npm run migrate`.

**Production (first time):** everything through 042 was run by hand, so run `npm run migrate:baseline` once, then `npm run migrate:status` to confirm 0 PENDING. After that, deploy = `git pull && npm run migrate`.
