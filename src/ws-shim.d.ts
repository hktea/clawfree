declare module "ws" {
  class WebSocket {
    static readonly OPEN: number;
    static readonly CONNECTING: number;
    readyState: number;
    constructor(url: string);
    on(event: string, listener: (...args: any[]) => void): this;
    send(data: string): void;
    close(): void;
  }

  export default WebSocket;
}
