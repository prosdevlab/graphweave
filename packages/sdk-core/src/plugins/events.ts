/** Event bus plugin interface. */

export type EventHandler<T = unknown> = (data: T) => void;

export interface EventBusPlugin {
  on<T>(event: string, handler: EventHandler<T>): () => void;
  emit<T>(event: string, data: T): void;
  off(event: string, handler: EventHandler): void;
}
