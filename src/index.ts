/**
 * ClawFree - OpenClaw 插件
 * 负责接收 ClawSV 转发的消息，调用 OpenClaw Agent，返回响应
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import { fetchConfigByToken } from './config.js';
import { spawn } from 'child_process';
import { DEFAULT_CONFIG } from './constants.js';

export class ClawFreeChannel extends EventEmitter {
  private config: {
    enabled: boolean;
    serverUrl: string;
    apiKey: string;
    token?: string;
  };
  private name = 'clawfree';
  private initialized = false;
  private ws: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: Map<string, any> = new Map();

  constructor(config: any) {
    super();
    this.config = {
      enabled: config.enabled ?? false,
      serverUrl: config.serverUrl ?? DEFAULT_CONFIG.serverUrl,
      apiKey: config.apiKey ?? '',
      token: config.token,
    };
  }

  async start() {
    if (!this.config.enabled) {
      console.log('[ClawFree] 插件未启用');
      return;
    }

    if (this.config.token && !this.config.apiKey) {
      console.log('[ClawFree] 检测到Token，正在自动获取配置...');
      const result = await fetchConfigByToken(this.config.token, this.config.serverUrl);
      
      if (result.success && result.apiKey) {
        this.config.serverUrl = result.serverUrl || this.config.serverUrl;
        this.config.apiKey = result.apiKey;
        console.log(`[ClawFree] 自动配置成功，使用Key: ${result.apiKey.substring(0, 12)}...`);
      } else {
        console.error(`[ClawFree] 自动配置失败: ${result.error}`);
        return;
      }
    }

    if (!this.config.apiKey) {
      console.error('[ClawFree] 未配置API Key');
      return;
    }

    console.log(`[ClawFree] 启动成功，连接到 ${this.config.serverUrl}`);
    console.log(`[ClawFree] 使用API Key: ${this.config.apiKey.substring(0, 12)}...`);
    
    this.initialized = true;
    
    // 启动 WebSocket 长连接
    this.connectWebSocket();
  }

  private connectWebSocket() {
    try {
      const WebSocket = require('ws');
      const wsUrl = this.config.serverUrl.replace('http', 'ws') + '/ws?apiKey=' + this.config.apiKey + '&clientType=openclaw';
      console.log(`[ClawFree] 正在连接WebSocket: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        console.log('[ClawFree] WebSocket 连接成功');
        // 清除重连定时器
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });
      
      this.ws.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('[ClawFree] 解析消息失败:', e);
        }
      });
      
      this.ws.on('close', () => {
        console.log('[ClawFree] WebSocket 连接关闭');
        this.scheduleReconnect();
      });
      
      this.ws.on('error', (err: any) => {
        console.error('[ClawFree] WebSocket 错误:', err.message);
      });
      
    } catch (e: any) {
      console.error('[ClawFree] WebSocket 连接失败:', e.message);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    console.log('[ClawFree] 5秒后尝试重连...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 5000);
  }

  private async handleServerMessage(msg: any) {
    console.log('[ClawFree] 收到消息:', msg.type);
    
    if (msg.type === 'connected') {
      console.log('[ClawFree] 已连接到ClawSV服务器');
      return;
    }
    
    if (msg.type === 'message') {
      const { content, from, timestamp, sessionId } = msg;
      console.log(`[ClawFree] 收到用户消息: ${content.substring(0, 50)}...`);

      // 优先使用服务器分配的会话ID，保证 custom/paid 两种链路的上下文一致。
      const targetSessionId = sessionId || `custom_${this.config.apiKey.slice(-8)}`;

      try {
        const reply = await this.callLocalOpenClaw(content, targetSessionId);

        // 发送响应回ClawSV
        this.sendResponse(from, reply, timestamp);
      } catch (e: any) {
        console.error('[ClawFree] 处理消息失败:', e.message);
        this.sendResponse(from, '抱歉，处理消息失败: ' + e.message, timestamp);
      }
    }
  }

  private callLocalOpenClaw(message: string, sessionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const openclawBin = process.env.OPENCLAW_BIN || 'openclaw';
      
      const args = [
        'agent',
        '--session-id', sessionId,
        '--message', message,
        '--json'
      ];
      
      console.log(`[ClawFree] 调用本地OpenClaw, session: ${sessionId}`);
      
      const proc = spawn(openclawBin, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('[plugins]') && !msg.includes('warn')) {
          stderr += msg;
        }
      });
      
      proc.on('close', (code) => {
        try {
          const jsonStart = stdout.indexOf('{');
          if (jsonStart === -1) {
            reject(new Error('无法找到JSON响应'));
            return;
          }
          
          const jsonStr = stdout.substring(jsonStart);
          const result = JSON.parse(jsonStr);
          let reply = '';
          
          if (result.result && result.result.payloads && result.result.payloads.length > 0) {
            reply = result.result.payloads.map((p: any) => p.text || p.content || '').join('\n');
          } else if (result.reply) {
            reply = result.reply;
          } else if (result.text) {
            reply = result.text;
          }
          
          if (!reply) {
            reject(new Error('无法解析AI响应'));
            return;
          }
          
          resolve(reply);
        } catch (e: any) {
          reject(e);
        }
      });
      
      proc.on('error', (err) => {
        reject(err);
      });
      
      // 60秒超时
      setTimeout(() => {
        proc.kill();
        reject(new Error('OpenClaw 响应超时'));
      }, 60000);
    });
  }

  private sendResponse(to: string, content: string, originalTimestamp?: number) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({
        type: 'response',
        to: to,
        content: content,
        originalTimestamp: originalTimestamp
      }));
    }
  }

  async stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log('[ClawFree] 已停止');
  }

  // 发送消息到 ClawSV
  async sendMessage(content: string, sessionId: string) {
    try {
      const response = await axios.post(`${this.config.serverUrl}/api/message`, {
        content,
        sessionId,
        apiKey: this.config.apiKey,
      });
      return response.data;
    } catch (error: any) {
      console.error('[ClawFree] 发送消息失败:', error.message);
      throw error;
    }
  }

  // 获取插件信息
  getChannelId() {
    return this.name;
  }

  // 处理收到的消息（供 OpenClaw 调用）
  async handleMessage(message: string, context: any) {
    return {
      content: `Echo: ${message}`,
      from: 'clawfree',
      timestamp: Date.now(),
    };
  }
}

// 插件导出（OpenClaw 插件标准格式）
export function createChannel(config: any) {
  return new ClawFreeChannel(config);
}
