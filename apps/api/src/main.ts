import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { corsOrigins, type Env } from "./common/config/env.schema";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RECAPTCHA_HEADER } from "./common/guards/recaptcha.guard";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // Behind Cloudflare or nginx the socket address is the proxy's. Trusting one
  // hop makes `req.ip` and the forwarded headers meaningful, which the rate
  // limiter and reCAPTCHA both rely on.
  app.set("trust proxy", 1);

  const origins = corsOrigins(config.get("CORS_ORIGIN", { infer: true }));
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", RECAPTCHA_HEADER],
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.get("PORT", { infer: true });
  // 0.0.0.0 rather than localhost, or the process is unreachable from outside
  // its own container.
  await app.listen(port, "0.0.0.0");

  const logger = new Logger("Bootstrap");
  logger.log(`API listening on port ${port}`);
  logger.log(`Accepting browser requests from: ${origins.join(", ")}`);
}

void bootstrap();
