import { NextRequest } from "next/server";
import { subscribe, unsubscribe } from "@/lib/sse-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const stream = new ReadableStream<string>({
    start(controller) {
      subscribe(projectId, controller);

      // Send initial heartbeat
      controller.enqueue(`data: ${JSON.stringify({ type: "connected", projectId })}\n\n`);

      // Keep-alive heartbeat every 25s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe(projectId, controller);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
