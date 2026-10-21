#!/bin/sh
# Container start: keep a signing key on the data volume if none was given,
# bring the database schema up to date, seed missing stalls, then serve.
set -e
if [ -z "$SESSION_SECRET" ]; then
  if [ ! -s /data/session-secret ]; then
    node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))" > /data/session-secret
    echo "Generated a SESSION_SECRET in /data/session-secret (set SESSION_SECRET to manage it yourself)."
  fi
  SESSION_SECRET="$(cat /data/session-secret)"
  export SESSION_SECRET
fi
npx prisma db push --skip-generate
npx prisma db seed
exec node server.mjs
