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

export type StoredAgent = {
  agentId: string;
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

