import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../common/config/env.schema";
import * as schema from "./schema";

/**
 * The database connection, as a single injectable.
 *
 * Repositories inject `DRIZZLE` and nothing else. Nothing above the repository
 * layer imports this module — that is what keeps "which database" a detail
 * rather than a dependency of the whole app.
 */

export const DRIZZLE = Symbol("DRIZZLE");
export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Hosted Postgres requires TLS, and the connection strings Supabase hands out
 * do not carry an `sslmode` parameter — postgres.js defaults to no TLS, so
 * without this every query fails on a fresh setup. A local database is the one
 * case where TLS is normally absent, so it is the exception rather than the
 * rule. An explicit `sslmode` in the URL always wins.
 */
export function sslMode(url: string): "require" | false {
  if (/[?&]sslmode=/.test(url)) return false; // postgres.js reads it from the URL
  return /@(localhost|127\.0\.0\.1|\[::1\])/.test(url) ? false : "require";
}

/** Held separately so shutdown can close the socket pool. */
const PG_CLIENT = Symbol("PG_CLIENT");
type PgClient = ReturnType<typeof postgres>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PgClient => {
        const url = config.get("DATABASE_URL", { infer: true });
        return postgres(url, {
          // Supabase's pooler does not support prepared statements.
          prepare: false,
          ssl: sslMode(url),
          max: 10,
        });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: PgClient): Database => drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DbModule.name);

  constructor(@Inject(PG_CLIENT) private readonly client: PgClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
    this.logger.log("Database connections closed.");
  }
}
