export class MessageQueue {
  private queues = new Map<string, string[]>();
  private active = new Map<string, AbortController>();

  enqueue(threadId: string, content: string): void {
    const queue = this.queues.get(threadId) ?? [];
    queue.push(content);
    this.queues.set(threadId, queue);
  }

  drain(threadId: string): string | null {
    const queue = this.queues.get(threadId);
    if (!queue || queue.length === 0) return null;
    const combined = queue.join("\n");
    this.queues.delete(threadId);
    return combined;
  }

  isActive(threadId: string): boolean {
    return this.active.has(threadId);
  }

  setActive(threadId: string, controller: AbortController): void {
    this.active.set(threadId, controller);
  }

  clearActive(threadId: string): void {
    this.active.delete(threadId);
  }

  abort(threadId: string): boolean {
    const controller = this.active.get(threadId);
    if (!controller) return false;
    controller.abort();
    this.active.delete(threadId);
    return true;
  }
}
