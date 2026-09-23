import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./common/config/env.schema";
import { ProxyThrottlerGuard } from "./common/guards/proxy-throttler.guard";
import { DbModule } from "./db/db.module";
import { InfraModule } from "./infra/infra.module";
import { AgentsModule } from "./modules/agents/agents.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Fails the boot with a readable list rather than surfacing later as an
      // undefined header inside an HTTP call.
      validate: validateEnv,
      envFilePath: [".env"],
    }),

    // A generous global ceiling; the endpoints that cost money override it with
    // @Throttle. This is in-memory, so it is per-process — Cloudflare's edge
    // rules are the layer that catches volumetric abuse before it gets here.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    // Drives the nightly sweep that retires expired agents from Retell. In
    // process on purpose -- see AgentExpiryService for why this is not a
    // crontab entry.
    ScheduleModule.forRoot(),

    DbModule,
    InfraModule,

    AuthModule,
    AgentsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ProxyThrottlerGuard }],
})
export class AppModule {}
