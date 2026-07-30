import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { SkipThrottle } from "@nestjs/throttler";
import { DRIZZLE, type Database } from "../../db/db.module";

/**
 * Liveness and readiness for whatever is watching the staging box.
 *
 * `/health` answers as long as the process is up. `/health/ready` also touches
 * the database, so a load balancer can tell "running" apart from "actually able
 * to serve requests".
 */
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: "ok", database: "up" };
    } catch {
      return { status: "degraded", database: "down" };
    }
  }
}
