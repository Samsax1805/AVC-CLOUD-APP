// Copies one backup archive to the private S3 bucket, then removes S3 backups older than 90 days.
// They live under files/db-backups/: the server's AWS role may write only inside files/, and the website's
// download and delete links accept plain file ids only, so nobody can reach these through the site.
// Run from the server folder so it uses the site's own settings and packages:  node ../ops/backup/offsite.js <file>
// Packages come from the server folder (the current folder when cron runs this)
const need = require('module').createRequire(`${process.cwd()}/`);
need('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = need('@aws-sdk/client-s3');

const KEEP_DAYS = 90;
const PREFIX = 'files/db-backups/';
const file = process.argv[2];
const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-north-1' });
const Bucket = process.env.S3_BUCKET;

(async () => {
  if (!file || !fs.existsSync(file)) throw new Error('no backup file given');
  if (!Bucket) throw new Error('S3_BUCKET is not set');
  const Key = `${PREFIX}${path.basename(file)}`;
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: fs.readFileSync(file), ContentType: 'application/gzip', ServerSideEncryption: 'AES256' }));
  // Old copies: anything in backups/ older than KEEP_DAYS
  // Clearing out old copies is a nicety (each is ~30 KB): if the role may not list the bucket, skip it
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  const old = [];
  let note = '';
  try {
    let token;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: PREFIX, ContinuationToken: token }));
      for (const o of page.Contents || []) if (o.LastModified && o.LastModified.getTime() < cutoff) old.push({ Key: o.Key });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (old.length) await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: old } }));
    if (old.length) note = `, removed ${old.length} older than ${KEEP_DAYS} days`;
  } catch (e) { note = ` (old copies not cleared: ${e.name})`; }
  console.log(`${new Date().toISOString()} copied to S3 ${Key}${note}`);
})().catch((e) => { console.error(`${new Date().toISOString()} S3 copy failed: ${e.name}: ${e.message}`); process.exit(1); });
