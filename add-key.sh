#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="$HOME/.openclaw/openclaw.json"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "openclaw.json not found. Install clawfree first."
  exit 1
fi

read -r -p "Enter the new oc_ API key: " API_KEY
case "$API_KEY" in
  oc_*) ;;
  *)
    echo "API key must start with oc_"
    exit 1
    ;;
esac

ACCOUNT_ID="${API_KEY: -8}"

API_KEY="$API_KEY" ACCOUNT_ID="$ACCOUNT_ID" CONFIG_PATH="$CONFIG_PATH" node <<'EOF'
const fs = require('fs');

const configPath = process.env.CONFIG_PATH;
const apiKey = process.env.API_KEY;
const accountId = process.env.ACCOUNT_ID;

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

config.plugins = config.plugins || {};
config.plugins.allow = Array.isArray(config.plugins.allow) ? config.plugins.allow : [];
if (!config.plugins.allow.includes('clawfree')) {
  config.plugins.allow.push('clawfree');
}

config.plugins.entries = config.plugins.entries || {};
config.plugins.entries.clawfree = { enabled: true };

config.channels = config.channels || {};
config.channels.clawfree = config.channels.clawfree || {};
config.channels.clawfree.enabled = true;
const legacyServerUrl = config.channels.clawfree.serverUrl;
delete config.channels.clawfree.serverUrl;
config.channels.clawfree.mode = 'local';
delete config.channels.clawfree.apiKey;
delete config.channels.clawfree.sessionKey;
delete config.channels.clawfree.pollIntervalMs;
delete config.channels.clawfree.debug;
config.channels.clawfree.accounts = config.channels.clawfree.accounts || {};
if (legacyServerUrl) {
  for (const account of Object.values(config.channels.clawfree.accounts)) {
    if (account && !account.serverUrl) {
      account.serverUrl = legacyServerUrl;
    }
  }
}
config.channels.clawfree.accounts[accountId] = {
  enabled: true,
  apiKey,
  pollIntervalMs: 5000,
  sessionKey: `agent:clawfree:${accountId}`,
  debug: false
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
EOF

echo "==> Added key: $ACCOUNT_ID"
echo "==> Recommended next command:"
echo "openclaw gateway"
