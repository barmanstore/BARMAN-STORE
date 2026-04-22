# Auto Backup Process

This document describes how automatic database backup works in this project.

## 1) How Auto Backup Works

At backend startup (`server/index.js`):

1. Environment variables are loaded.
2. If `AUTO_BACKUP_ENABLED=true`, a scheduler starts.
3. Scheduler runs every `AUTO_BACKUP_INTERVAL_MINUTES`.
4. Optional startup backup runs when `AUTO_BACKUP_ON_STARTUP=true`.

Each backup run:

1. Flushes SQLite WAL checkpoint.
2. Creates snapshot using `VACUUM INTO`.
3. Writes a file with `auto` tag.
4. Applies retention cleanup for old auto backups.

## 2) Backup Storage Location

Backups are stored in `BACKUP_DIR`.

- Default: `server/backups`
- In this project path: `c:\inetpub\wwwroot\barman-storereact\server\backups`

## 3) File Naming

Auto backup file format:

`barman-store-auto-YYYYMMDD-HHMMSS.db`

Examples:

- `barman-store-auto-20260222-231500.db`
- `barman-store-auto-20260223-051500.db`

Manual and restore safety backups are separate tags:

- Manual: `barman-store-manual-...`
- Pre-restore: `barman-store-pre-restore-...`

## 4) Environment Variables

Set in `.env`:

```env
BACKUP_DIR=server/backups
AUTO_BACKUP_ENABLED=false
AUTO_BACKUP_INTERVAL_MINUTES=360
AUTO_BACKUP_ON_STARTUP=false
AUTO_BACKUP_RETENTION_COUNT=30
AUTO_BACKUP_RETENTION_DAYS=30
```

Notes:

- `AUTO_BACKUP_ENABLED=false` means scheduler is off.
- `AUTO_BACKUP_RETENTION_COUNT=0` means unlimited by count.
- `AUTO_BACKUP_RETENTION_DAYS=0` means unlimited by age.

## 5) Retention Behavior

Retention cleanup applies to `auto` backup files only.

Files are removed when either condition is true:

1. Older than `AUTO_BACKUP_RETENTION_DAYS` (if configured > 0).
2. Exceed `AUTO_BACKUP_RETENTION_COUNT` newest files (if configured > 0).

## 6) How To Verify It Is Running

Use admin API:

- `GET /api/admin/backup/status`

Response includes:

- `enabled`
- `running`
- `last_run_at`
- `last_success_at`
- `last_error`
- `last_backup_file`
- `next_run_at`
- `backup_dir`

Also check files in backup folder for new `barman-store-auto-*.db` entries.

## 7) Quick Enable Example

```env
AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_INTERVAL_MINUTES=60
AUTO_BACKUP_ON_STARTUP=true
AUTO_BACKUP_RETENTION_COUNT=48
AUTO_BACKUP_RETENTION_DAYS=14
```

Then restart backend and confirm with:

- `GET /api/admin/backup/status`
