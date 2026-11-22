#!/bin/bash
# Proves a backup can be restored: loads the newest archive into a temporary database
# (avc_restore_check) on the same cluster, compares every collection's count with the live database,
# then deletes the temporary database. The live database is only read, never written.
set -euo pipefail
APP=/home/ubuntu/avc
F=${1:-$(ls -t /home/ubuntu/backups/avc-*.archive.gz | head -1)}
URI=$(grep -E "^MONGO_URI=" "$APP/server/.env" | cut -d= -f2-)
CHECK_URI=$(python3 -c "import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print(u.urlunparse(p._replace(path='/avc_restore_check')))" "$URI")
LIVE_DB=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).path.strip('/') or 'test')" "$URI")
echo "restoring $(basename "$F") into avc_restore_check (live database: $LIVE_DB, read only)"
mongorestore --quiet --uri="$CHECK_URI" --gzip --archive="$F" --nsFrom="$LIVE_DB.*" --nsTo="avc_restore_check.*" --drop
cd "$APP/server" && node -e '
require("dotenv").config(); const m = require("mongoose");
(async () => {
  const conn = await m.createConnection(process.env.MONGO_URI).asPromise();
  const live = conn.db; const copy = conn.useDb("avc_restore_check").db;
  const names = (await live.listCollections().toArray()).map((c) => c.name).sort();
  let same = 0; const diff = [];
  for (const n of names) { const a = await live.collection(n).countDocuments(); const b = await copy.collection(n).countDocuments(); if (a === b) same++; else diff.push(`${n} live ${a} / backup ${b}`); }
  console.log(`collections matching: ${same}/${names.length}${diff.length ? " | differ (changed since the backup): " + diff.join(", ") : ""}`);
  const u = await copy.collection("users").findOne({}, { projection: { name: 1 } });
  console.log("sample record readable:", !!u);
  await copy.dropDatabase(); console.log("temporary database removed");
  await conn.close();
})().catch((e) => { console.error("check failed:", e.message); process.exit(1); });'
