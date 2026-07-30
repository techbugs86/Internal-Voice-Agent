import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { SupabaseAuthService } from "../../infra/supabase/supabase-auth.service";
import { AuthedRequest, bearerToken } from "../http/authed-request";

/**
 * Requires a valid Supabase access token and attaches the user to the request.
 *
 * Applied per-route rather than globally: the share page (`GET /agents/:id/public`)
 * and the web-call endpoint must stay reachable without an account — that
 * anonymous path is the product. A global guard with an `@Public()` escape hatch
 * would make forgetting the decorator the failure mode; this way forgetting the
 * guard is, which is the safer thing to notice in review.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: SupabaseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const token = bearerToken(req);
    if (!token) throw new UnauthorizedException("Sign in to continue.");

    const user = await this.auth.getUser(token);
    if (!user) {
      throw new UnauthorizedException("Your session has expired. Sign in again.");
    }

    req.user = user;
    return true;
  }
}
