import { promises as fs } from "fs";
import path from "path";
import type { AgentSpec, StoredAgent } from "./types";

/**
 * Agent registry.
 *
 * The shareable URL is /a/<agentId>, so that page needs to look up the agent's
 * metadata — hence a store rather than relying on Retell alone.
 *
 * Two backends:
 *   - Supabase/Postgres, used automatically when SUPABASE_URL and
 *     SUPABASE_SERVICE_ROLE_KEY are set. Required on Vercel (serverless file
 *     systems are ephemeral and not shared between instances).
 *   - A local JSON file, used otherwise. Zero-config for local development.
 */

export interface AgentStore {
  save(agent: StoredAgent): Promise<void>;
  get(agentId: string): Promise<StoredAgent | null>;
  list(): Promise<StoredAgent[]>;
}

/* ---------------------------------------------------------------- file store */

const FILE = path.join(process.cwd(), "data", "agents.json");

async function readAll(): Promise<StoredAgent[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoredAgent[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

const fileStore: AgentStore = {
  async save(agent) {
    const all = await readAll();
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(
      FILE,
      JSON.stringify([agent, ...all.filter((a) => a.agentId !== agent.agentId)], null, 2),
    );
  },
  async get(agentId) {
    return (await readAll()).find((a) => a.agentId === agentId) ?? null;
  },
  async list() {
    return readAll();
  },
};

/* ------------------------------------------------------------ supabase store */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Expects a table created with:
 *
 *   create table agents (
 *     agent_id        text primary key,
 *     llm_id          text not null,
 *     agent_name      text not null,
 *     spec            jsonb not null,
 *     compiled_prompt text not null,
 *     created_at      timestamptz not null default now()
 *   );
 *
 * The whole intake form is stored as jsonb so adding a field to AgentSpec does
 * not require a migration.
 */
type Row = {
  agent_id: string;
  llm_id: string;
  agent_name: string;
  spec: AgentSpec;
  compiled_prompt: string;
  created_at: string;
};

function toRow(a: StoredAgent): Row {
  return {
    agent_id: a.agentId,
    llm_id: a.llmId,
    agent_name: a.spec.agentName,
    spec: a.spec,
    compiled_prompt: a.compiledPrompt,
    created_at: a.createdAt,
  };
}

function fromRow(r: Row): StoredAgent {
  return {
    agentId: r.agent_id,
    llmId: r.llm_id,
    spec: r.spec,
    compiledPrompt: r.compiled_prompt,
    createdAt: r.created_at,
  };
}

async function rest<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase error (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

const supabaseStore: AgentStore = {
  async save(agent) {
    await rest("agents", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(toRow(agent)),
    });
  },
  async get(agentId) {
    const rows = await rest<Row[]>(
      `agents?agent_id=eq.${encodeURIComponent(agentId)}&limit=1`,
    );
    return rows[0] ? fromRow(rows[0]) : null;
  },
  async list() {
    const rows = await rest<Row[]>("agents?order=created_at.desc");
    return rows.map(fromRow);
  },
};

export const store: AgentStore =
  SUPABASE_URL && SUPABASE_KEY ? supabaseStore : fileStore;
