import { subscribeAsyncTaskEvents } from "@/lib/services/project/async-task-service";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: async-task\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
      };
      unsubscribe = subscribeAsyncTaskEvents(projectId, send);
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 25_000);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
