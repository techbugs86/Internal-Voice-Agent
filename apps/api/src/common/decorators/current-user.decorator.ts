import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@agent/shared";
import type { AuthedRequest } from "../http/authed-request";

/**
 * Injects the signed-in user into a handler parameter.
 *
 * Only valid on routes behind `AuthGuard` — the throw is a wiring bug, not a
 * runtime condition, so it fails loudly rather than handing back `undefined`
 * that would later be written into a `user_id` column.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) {
      throw new Error(
        "@CurrentUser() was used on a route that is not behind AuthGuard.",
      );
    }
    return req.user;
  },
);
