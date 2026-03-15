/**
 * In-memory SSE subscriber store.
 * Works for single-process local Next.js dev server.
 */
type Controller = ReadableStreamDefaultController<string>;

const store = new Map<string, Set<Controller>>();

export function subscribe(projectId: string, ctrl: Controller) {
  if (!store.has(projectId)) store.set(projectId, new Set());
  store.get(projectId)!.add(ctrl);
}

export function unsubscribe(projectId: string, ctrl: Controller) {
  store.get(projectId)?.delete(ctrl);
  if (store.get(projectId)?.size === 0) store.delete(projectId);
}

export function broadcast(projectId: string, event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  store.get(projectId)?.forEach((ctrl) => {
    try {
      ctrl.enqueue(payload);
    } catch {
      // Controller already closed — will be cleaned up on next subscribe cycle
    }
  });
}
