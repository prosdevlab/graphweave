/** Transport plugin interface for network communication. */

export interface TransportPlugin {
  request<T>(url: string, options?: RequestOptions): Promise<T>;
  stream(url: string, handlers: StreamHandlers): StreamConnection;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface StreamHandlers {
  onMessage(event: string, data: unknown): void;
  onError(error: Error): void;
  onClose(): void;
}

export interface StreamConnection {
  close(): void;
}
