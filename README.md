# ClawFree

ClawFree is an OpenClaw channel plugin for the `ClawWX + ClawSV + OpenClaw` stack.

- ClawSV receives messages from the mini program.
- ClawFree keeps polling or websocket registration to ClawSV.
- ClawFree injects messages into the local OpenClaw runtime.
- Replies are sent back to ClawSV and then returned to the client.

## Requirements

- OpenClaw `2026.3.x` or newer
- Node.js `18+`
- A valid ClawSV `apiKey` or login `token`

The ClawSV server address is built into the plugin as `https://wx.clawwx.top`.
Customers do not need to configure `serverUrl`.

## Build

```bash
npm install
npm run build
```

## Install

Development link install:

```bash
openclaw plugins install -l .
```

Copy install from the current folder:

```bash
openclaw plugins install .
```

## Config

Runtime config lives under `channels.clawfree`.
The old `plugins.entries.clawfree.*` path is no longer supported.

Single account:

```json
{
  "plugins": {
    "allow": ["clawfree"]
  },
  "channels": {
    "clawfree": {
      "enabled": true,
      "apiKey": "oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "pollIntervalMs": 5000,
      "sessionKey": "agent:main:main",
      "debug": false,
      "mode": "local"
    }
  }
}
```

Multi-account:

```json
{
  "plugins": {
    "allow": ["clawfree"]
  },
  "channels": {
    "clawfree": {
      "enabled": true,
      "defaults": {
        "pollIntervalMs": 5000,
        "debug": false
      },
      "accounts": {
        "sales": {
          "apiKey": "oc_xxx_sales",
          "sessionKey": "agent:clawfree:sales"
        },
        "support": {
          "apiKey": "oc_xxx_support",
          "sessionKey": "agent:clawfree:support"
        }
      }
    }
  }
}
```

Token-based config:

```json
{
  "plugins": {
    "allow": ["clawfree"]
  },
  "channels": {
    "clawfree": {
      "enabled": true,
      "token": "your-login-token",
      "pollIntervalMs": 5000,
      "debug": false,
      "mode": "local"
    }
  }
}
```

## Run

```bash
openclaw gateway
openclaw status --deep
openclaw channels status --probe
```

Debug log:

```text
~/.openclaw/logs/clawfree-debug.log
```

## Documentation

- Install guide: [INSTALL.md](./INSTALL.md)
- Chinese install guide: [INSTALL.zh-CN.md](./INSTALL.zh-CN.md)
