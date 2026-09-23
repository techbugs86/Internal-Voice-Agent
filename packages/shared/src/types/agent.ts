/**
 * What the user fills in on the builder page.
 *
 * This is deliberately shaped like the sections of a Retell `general_prompt`
 * (identity → company context → services → style → guardrails) so the form maps
 * onto the prompt almost one-to-one.
 */
export type AgentSpec = {
  /** Display name for the agent, and what it calls itself on the call. */
  agentName: string;
  /** First thing it says. Empty = wait for the caller to speak first. */
  firstLine: string;

  companyName: string;
  /** What the business actually does, in the user's own words. */
  companyDescription: string;
  /** Opening hours, timezone, holidays — free text. */
  businessHours: string;
  /** Address, service area, phone, website — anything the agent may be asked. */
  contactDetails: string;

  /** The services or products the agent should be able to talk about. */
  services: string;
  /** Personality and speaking style. */
  tone: string;
  /** What the agent should accomplish on the call, step by step. */
  callGoal: string;
  /** Hard rules, topics to avoid, escalation paths. */
  guardrails: string;

  voiceId: string;
  language: string;
};

/** A row in the agent registry. `userId` is the owner — see the auth module. */
export type StoredAgent = {
  /** The id in the share link. Stable for the life of the agent. */
  agentId: string;
  /**
   * The id Retell knows this agent by, in whichever account currently hosts it.
   *
   * Equal to `agentId` for everything created since the last account move, and
   * different for agents migrated across one. Always dial this, never `agentId`.
   */
  retellAgentId: string;
  userId: string;
  llmId: string;
  spec: AgentSpec;
  /** What we actually sent to Retell as `general_prompt`. */
  compiledPrompt: string;
  createdAt: string;
};

export type CreateAgentResult = {
  agentId: string;
  agentName: string;
  /** The shareable "talk to it" link. */
  url: string;
};

/**
 * What the public /a/<id> page needs to render. Deliberately small — anything
 * beyond this is presentation sugar that must be optional, because Retell only
 * knows the agent's name, not which company it was built for.
 */
export type AgentView = {
  agentId: string;
  agentName: string;
  /** Empty when we are falling back to Retell. */
  companyName: string;
};

/** One entry in the signed-in user's agent list. */
export type AgentSummary = {
  agentId: string;
  agentName: string;
  companyName: string;
  createdAt: string;
  /** The shareable "talk to it" link, absolute so it can be copied as-is. */
  url: string;
};

/**
 * What the dashboard needs.
 *
 * No allowance is reported because there is no cap — an account may create as
 * many agents as it likes.
 */
export type AgentListResult = {
  agents: AgentSummary[];
};

export type WebCallToken = {
  accessToken: string;
  callId: string;
};
