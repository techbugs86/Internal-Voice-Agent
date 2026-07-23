import { getRetellAgent } from "./retell";
import { store } from "./store";

/**
 * What the talk page needs to render. Deliberately small — anything beyond
 * this is presentation sugar that must be optional, because Retell only knows
 * the agent's name, not which company it was built for.
 */
export type AgentView = {
  agentId: string;
  agentName: string;
  /** Empty when we are falling back to Retell. */
  companyName: string;
};

/**
 * Resolves an agent for the public /a/<id> page.
 *
 * Order matters:
 *   1. Our registry — has the full intake form, including the company name.
 *   2. Retell itself — every agent we created lives there permanently, so the
 *      share link keeps working even with no database configured (the default
 *      on a fresh Vercel deploy, where the filesystem is read-only).
 *
 * Returns null only when neither knows the agent, which is a genuine 404.
 */
export async function getAgentView(agentId: string): Promise<AgentView | null> {
  try {
    const stored = await store.get(agentId);
    if (stored) {
      return {
        agentId: stored.agentId,
        agentName: stored.spec.agentName,
        companyName: stored.spec.companyName,
      };
    }
  } catch (err) {
    // A broken registry must not take the share link down with it.
    console.error("Agent registry unavailable, falling back to Retell:", err);
  }

  try {
    const agent = await getRetellAgent(agentId);
    if (!agent?.agent_id) return null;
    return {
      agentId: agent.agent_id,
      agentName: agent.agent_name?.trim() || "your AI agent",
      companyName: "",
    };
  } catch (err) {
    console.error("Retell does not recognise this agent:", err);
    return null;
  }
}
