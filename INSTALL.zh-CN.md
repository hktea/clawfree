# ClawFree 安装说明

`clawfree` 通过 `openclaw plugins install` 安装，运行配置写在 `channels.clawfree`。
插件内部固定使用 `https://wx.clawwx.top`，客户侧不需要配置 `serverUrl`。

## 要求

- 已安装 `OpenClaw`
- 已安装 `Node.js 18+`
- 已有可用的 `oc_` API Key，或登录 `token`

## 一键安装

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/hktea/clawfree/master/install.ps1 | iex
```

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/hktea/clawfree/master/install.sh | bash
```

安装脚本会提示输入 `oc_` key，并自动写好 `channels.clawfree` 配置。

## 追加新的 API Key

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/hktea/clawfree/master/add-key.ps1 | iex
```

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/hktea/clawfree/master/add-key.sh | bash
```

脚本会把新 key 写入 `channels.clawfree.accounts`，并自动用 key 后 8 位作为：

- account id
- `sessionKey`，例如 `agent:clawfree:ec97380f`

## 生成后的配置示例

```json
{
  "plugins": {
    "allow": ["clawfree"]
  },
  "channels": {
    "clawfree": {
      "enabled": true,
      "mode": "local",
      "accounts": {
        "12345678": {
          "enabled": true,
          "apiKey": "oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          "pollIntervalMs": 5000,
          "sessionKey": "agent:clawfree:12345678",
          "debug": false
        }
      }
    }
  }
}
```

多 key 示例：

```json
{
  "plugins": {
    "allow": ["clawfree"]
  },
  "channels": {
    "clawfree": {
      "enabled": true,
      "mode": "local",
      "accounts": {
        "key1": {
          "enabled": true,
          "apiKey": "oc_xxx_key_1",
          "sessionKey": "agent:clawfree:key1"
        },
        "key2": {
          "enabled": true,
          "apiKey": "oc_xxx_key_2",
          "sessionKey": "agent:clawfree:key2"
        }
      }
    }
  }
}
```

## 安装完成后检查

```bash
openclaw plugins list
openclaw status --deep
```

你应该看到：

- `ClawFree` 已加载
- `ClawFree` 状态为 `ON / OK / configured`

## 常见检查

- 小程序里的 key 和本机配置的 `oc_` key 是否一致
- `openclaw status --deep` 里 `ClawFree` 是否为 `OK`
- 本机是否能访问 `https://wx.clawwx.top`

进一步排查：

```bash
openclaw logs --follow
```
