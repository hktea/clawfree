#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/hktea/clawfree.git"
TMP_DIR="$(mktemp -d)"
REPO_DIR="$TMP_DIR/clawfree"
PLUGIN_DIR="$HOME/.openclaw/extensions/clawfree"
CONFIG_DIR="$HOME/.openclaw"
CONFIG_PATH="$CONFIG_DIR/openclaw.json"

echo "==> Download clawfree"
git clone "$REPO_URL" "$REPO_DIR"
cd "$REPO_DIR"

echo "==> Install dependencies"
npm install

echo "==> Build plugin"
npm run build

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_PATH" ]; then
  cp "$CONFIG_PATH" "$CONFIG_PATH.clawfree-installer.bak.$(date +%Y%m%d-%H%M%S)"
  CONFIG_PATH="$CONFIG_PATH" node <<'EOF'
const fs = require('fs');

const configPath = process.env.CONFIG_PATH;
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (config.plugins) {
  if (Array.isArray(config.plugins.allow)) {
    config.plugins.allow = config.plugins.allow.filter((name) => name !== 'clawfree');
  }

  if (config.plugins.entries && typeof config.plugins.entries === 'object') {
    delete config.plugins.entries.clawfree;
  }
}

if (config.channels && typeof config.channels === 'object') {
  delete config.channels.clawfree;
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
EOF
fi

echo "==> Install plugin"
echo "==> If OpenClaw asks for security confirmation, allow it and continue"
rm -rf "$PLUGIN_DIR"
openclaw plugins install .

read -r -p "Enter your oc_ API key: " API_KEY
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

const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};

config.plugins = config.plugins || {};
config.plugins.allow = Array.isArray(config.plugins.allow) ? config.plugins.allow : [];
if (!config.plugins.allow.includes('clawfree')) {
  config.plugins.allow.push('clawfree');
}

config.plugins.entries = config.plugins.entries || {};
config.plugins.entries.clawfree = {
  ...(config.plugins.entries.clawfree || {}),
  enabled: true
};

config.channels = config.channels || {};
config.channels.clawfree = {
  enabled: true,
  mode: 'local',
  accounts: {
    [accountId]: {
      enabled: true,
      apiKey,
      pollIntervalMs: 5000,
      sessionKey: `agent:clawfree:${accountId}`,
      debug: false
    }
  }
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
EOF

echo "==> Done. Current plugin list:"
openclaw plugins list

echo "==> Recommended next command:"
echo "openclaw status --deep"
