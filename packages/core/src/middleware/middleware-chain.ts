import { OutboxMiddleware, OutboxMiddlewareContext } from './outbox-middleware.interface';

type MiddlewareFunction = (
  context: OutboxMiddlewareContext,
  next: () => Promise<void>,
) => Promise<void>;

function combineMiddlewareFunctions(
  middlewares: MiddlewareFunction[],
): MiddlewareFunction {
  return middlewares.reduce(
    (previous, current): MiddlewareFunction =>
      (context, next) =>
        previous(context, () => current(context, next)),
  );
}

export function combineMiddlewares(
  middlewares: OutboxMiddleware[],
): MiddlewareFunction {
  const functions = middlewares.map((m): MiddlewareFunction => {
    return (context, next) => m.process(context, next);
  });
  return combineMiddlewareFunctions(functions);
}
