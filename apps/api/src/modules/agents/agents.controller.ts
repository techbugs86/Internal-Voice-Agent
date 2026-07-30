import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  agentSpecSchema,
  type AgentListResult,
  type AgentSpec,
  type AgentView,
  type AuthUser,
  type CreateAgentResult,
  type WebCallToken,
} from "@agent/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RecaptchaGuard } from "../../common/guards/recaptcha.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  /**
   * Builds an agent for the signed-in user.
   *
   * Both guards are here because both failure modes cost money: without
   * `AuthGuard` there is nobody to attribute the agent to, and without
   * `RecaptchaGuard` a script could sit here spending Anthropic and Retell
   * credit all night. Guards run before the handler, so a rejected request
   * never reaches either provider.
   */
  @Post()
  @UseGuards(AuthGuard, RecaptchaGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(agentSpecSchema)) spec: AgentSpec,
    @CurrentUser() user: AuthUser,
  ): Promise<CreateAgentResult> {
    return this.agents.create(spec, user.id);
  }

  /** The caller's own agents. Never anyone else's — see AgentsRepository. */
  @Get()
  @UseGuards(AuthGuard)
  list(@CurrentUser() user: AuthUser): Promise<AgentListResult> {
    return this.agents.listForUser(user.id);
  }

  /**
   * PUBLIC. Backs the /a/<agentId> share page.
   *
   * Anyone with the link can open it without an account — that anonymous path
   * is the product, so do not put a guard here.
   */
  @Get(":id/public")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async publicView(@Param("id") id: string): Promise<AgentView> {
    const view = await this.agents.getPublicView(id);
    if (!view) throw new NotFoundException("Unknown agent.");
    return view;
  }

  /**
   * PUBLIC. Starts a live voice call with the agent.
   *
   * This is the most expensive endpoint in the app — Retell bills per minute —
   * and it cannot be put behind a login without breaking the share link. So it
   * gets the tightest rate limit instead: a real person clicks this once or
   * twice, never six times a minute.
   */
  @Post(":id/web-call")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  webCall(@Param("id") id: string): Promise<WebCallToken> {
    return this.agents.createWebCall(id);
  }
}
