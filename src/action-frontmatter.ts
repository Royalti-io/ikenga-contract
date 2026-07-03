// Ikenga skill-action frontmatter schema — the source-of-truth shape for an
// Atelier skill *action*'s YAML frontmatter (the block between the leading
// `---` fences of an `actions/*.md` file).
//
// The Rust loader in `royalti-io/ikenga` at
// `src-tauri/src/pkg/skill_actions.rs` mirrors this schema. Field changes MUST
// be made in lockstep with that Rust struct — same convention as
// manifest.ts ↔ manifest.rs.
//
// Every field below is justified in plans/atelier/06-skill-action-contract.md.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Identity & taxonomy (G-TAXONOMY)
// ---------------------------------------------------------------------------

/**
 * The eight stateful domains plus the one stateless generic skill.
 * `skill-core` is the ONLY legal `depends_on` target (one-way edge, G-04/E-14).
 */
export const DomainEnum = z.enum([
  'tasks',
  'mail',
  'outbound',
  'sales',
  'finance',
  'content',
  'research',
  'strategy',
  'skill-core',
]);
export type Domain = z.infer<typeof DomainEnum>;

// ---------------------------------------------------------------------------
// UX modes (R5, E-11) — exactly five
// ---------------------------------------------------------------------------

/**
 * How an action presents itself to the operator.
 *  - confirm   : preview the planned effect, single yes/no, then run.
 *  - silent    : run with no prompt (still subject to capability scopes).
 *  - form      : collect `inputs_schema` from the operator before running.
 *  - streaming : run with live token/log streaming surfaced in the dock.
 *  - approve   : run-THEN-pause on a produced draft; operator approves/edits
 *                /rejects the artifact before any external side effect commits
 *                (the draft-review gate, E-11).
 */
export const UxModeEnum = z.enum([
  'confirm',
  'silent',
  'form',
  'streaming',
  'approve',
]);
export type UxMode = z.infer<typeof UxModeEnum>;

// ---------------------------------------------------------------------------
// Run binding (R5, G-01) — how the action actually executes
// ---------------------------------------------------------------------------

/** chat_prompt: hand a templated prompt to the engine in the dock chat. */
const ChatPromptRun = z.object({
  kind: z.literal('chat_prompt'),
  // Prompt template; may interpolate validated `inputs` via {{var}}.
  prompt: z.string().min(1),
});

/** sidecar: invoke a bundled CLI sidecar by its manifest-declared id. */
const SidecarRun = z.object({
  kind: z.literal('sidecar'),
  sidecar_id: z.string().min(1),
  // Argv template; entries may interpolate validated `inputs`.
  args: z.array(z.string()).default([]),
});

/** mcp_tool: call a tool on a pkg-declared MCP server. */
const McpToolRun = z.object({
  kind: z.literal('mcp_tool'),
  server_id: z.string().min(1),
  tool: z.string().min(1),
});

export const RunBinding = z.discriminatedUnion('kind', [
  ChatPromptRun,
  SidecarRun,
  McpToolRun,
]);
export type RunBinding = z.infer<typeof RunBinding>;

// ---------------------------------------------------------------------------
// Triggers (R5) — absorbs the 41 legacy crons. An action may be reachable by
// more than one trigger; `manual` is the implicit default if none declared.
// ---------------------------------------------------------------------------

/** Operator-invoked from the command surface / dock. */
const ManualTrigger = z.object({
  kind: z.literal('manual'),
});

/** Time-driven. `cron` is a standard 5-field crontab expression. */
const ScheduleTrigger = z.object({
  kind: z.literal('schedule'),
  cron: z.string().min(1),
  // Optional human label surfaced in the schedule UI.
  label: z.string().optional(),
});

/** Inbound HTTP trigger routed through the shell bridge. */
const WebhookTrigger = z.object({
  kind: z.literal('webhook'),
  // Stable path segment; the shell namespaces it under the pkg id.
  path: z.string().min(1),
});

/** Reacts to an internal shell/domain event by name. */
const EventTrigger = z.object({
  kind: z.literal('event'),
  event: z.string().min(1),
});

export const Trigger = z.discriminatedUnion('kind', [
  ManualTrigger,
  ScheduleTrigger,
  WebhookTrigger,
  EventTrigger,
]);
export type Trigger = z.infer<typeof Trigger>;

// ---------------------------------------------------------------------------
// Capabilities (G-08, R18/R19) — coarse permission grants an action requires.
// `sqlite` is the stateful-domain seam: state lives in the local ikenga.db,
// reached through the host dbQuery (SELECT-only) and dbExec (parameterized
// mutate) bridges. The *table scope* is NOT declared here — it is declared once
// at the pkg manifest as permissions["sqlite.tables"] and cross-checked at
// install time against the generated tables.json (the applied ikenga.db STRICT
// schema). The frontmatter only asserts "this action touches sqlite".
// ---------------------------------------------------------------------------

export const CapabilityEnum = z.enum([
  'sqlite',   // host.dbQuery / host.dbExec against ikenga.db (R18/R19)
  'mcp',      // call declared MCP tools
  'sidecar',  // spawn declared sidecars
  'network',  // outbound network
  'fs',       // host filesystem (scoped by manifest)
  'secrets',  // read Stronghold-vaulted secrets
  'chat',     // drive the dock chat engine
]);
export type Capability = z.infer<typeof CapabilityEnum>;

// ---------------------------------------------------------------------------
// Setup lifecycle (D-02, setup-lifecycle decision) — `setup` is an optional,
// well-known action on EVERY skill. It localises the skill per project by
// writing ${CLAUDE_PROJECT_DIR}/.atelier/<skill>/manifest.json. It runs IN
// CHAT, never as a form screen. Two modes:
//   - ai_infer : the agent drafts the instance config from the repo/site, the
//                operator confirms/edits in chat.
//   - interview: the agent asks the operator a scripted set of questions.
// `template_version` carries a migrate path so an upgraded skill can migrate an
// older instance file forward.
// ---------------------------------------------------------------------------

export const SetupModeEnum = z.enum(['ai_infer', 'interview']);
export type SetupMode = z.infer<typeof SetupModeEnum>;

export const SetupSpec = z.object({
  mode: SetupModeEnum,
  // Bumped whenever the instance-file shape changes; drives the migrate path.
  template_version: z.number().int().positive(),
  // For ai_infer: where the agent should look to draft the instance config.
  infer_sources: z.array(z.string()).optional(),
  // For interview: ordered question ids the chat flow walks.
  interview_questions: z.array(z.string()).optional(),
});
export type SetupSpec = z.infer<typeof SetupSpec>;

// ---------------------------------------------------------------------------
// ActionFrontmatter — the locked shape.
// ---------------------------------------------------------------------------

export const ActionFrontmatter = z
  .object({
    // --- identity ---
    /** Stable action id, unique within the skill. kebab-case. */
    name: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9-]*$/, 'name must be kebab-case'),
    /** One-line human description shown in the command surface. */
    description: z.string().min(1),
    /** Owning domain (G-TAXONOMY). */
    domain: DomainEnum,

    // --- presentation & io ---
    /** How the action presents to the operator (R5/E-11). */
    ux_mode: UxModeEnum,
    /**
     * JSON-Schema describing the action's inputs. Kept as an opaque object here
     * (validated as JSON-Schema at the destination); `form`/`approve` modes
     * render it, `chat_prompt` runs interpolate validated values from it.
     */
    inputs_schema: z.record(z.string(), z.unknown()).optional(),

    // --- execution ---
    /** What the action actually does (G-01). */
    run: RunBinding,
    /** How the action can be invoked. Empty ⇒ manual-only. */
    triggers: z.array(Trigger).default([]),

    // --- dependency & permissions ---
    /**
     * One-way dependency edge. The ONLY legal target is 'skill-core'
     * (G-04/E-14); any other entry is rejected by the lint in
     * 06-skill-action-contract.md §"depends_on lint". Modeled as a literal
     * array so the schema itself refuses non-skill-core targets.
     */
    depends_on: z.array(z.literal('skill-core')).default([]),
    /** Coarse capability grants this action needs (G-08, R18/R19). */
    requires_capabilities: z.array(CapabilityEnum).default([]),

    // --- lifecycle ---
    /**
     * Present ONLY on the well-known `setup` action. Omitted on every other
     * action. Refined below.
     */
    setup: SetupSpec.optional(),
  })
  .strict()
  .superRefine((fm, ctx) => {
    // The `setup` block is allowed iff this IS the setup action.
    if (fm.name === 'setup' && fm.setup === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['setup'],
        message: 'the "setup" action must declare a `setup` block',
      });
    }
    if (fm.name !== 'setup' && fm.setup !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['setup'],
        message: '`setup` block is only valid on the "setup" action',
      });
    }
    // An action that runs SQL must declare the `sqlite` capability so the
    // pkg-manifest sqlite.tables cross-check has something to bind to.
    // (The reverse — declaring sqlite without using it — is allowed/harmless.)
  });

export type ActionFrontmatter = z.infer<typeof ActionFrontmatter>;
