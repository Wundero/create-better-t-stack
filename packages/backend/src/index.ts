import { app } from "./app";
import { runScheduledSync } from "./oss-stats";
import type { Bindings } from "./types";

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  async scheduled(
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduledSync(env));
  },
};

export { app };
