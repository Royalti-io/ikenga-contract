import { z } from 'zod';

/**
 * Identity of the human operating the shell, injected into `hostContext` at
 * the AppBridge handshake (`buildHostContext()` in
 * `shell/src/lib/pkg/host-context.ts`, cast in alongside `royaltiSuite` /
 * `supabase` / `secrets`). Host-injected, not pkg-declared — there is no
 * manifest capability gate for it.
 *
 * Currently sourced from the free-text onboarding `userName` (shell store),
 * falling back to the OS username when unset. Treat `id` as a stable
 * display label, NOT a durable account id or an auth subject.
 */
export const OperatorIdentitySchema = z
  .object({
    /** Stable-enough identifier for the operator (today: `userName` or an
     *  OS-username fallback). Not an auth subject. */
    id: z.string(),
    /** Human-friendly label, when it differs from `id`. */
    displayName: z.string().optional(),
  })
  .strict();
export type OperatorIdentity = z.infer<typeof OperatorIdentitySchema>;

/**
 * hostContext fields Ikenga casts onto the MCP-UI-Apps `McpUiHostContext`
 * base type (imported from `@modelcontextprotocol/ext-apps/app-bridge` —
 * this package does not redefine that base type, only the Ikenga-specific
 * extensions layered onto it).
 *
 * `operator` is OPTIONAL: older shells and the initial handshake before the
 * onboarding step has run won't send it. A consumer MUST treat an absent
 * `operator` as an UNKNOWN operator and fail SAFE — e.g. use a confirming
 * `ux_mode` ('confirm') rather than auto-approving an operator-scoped
 * action — never assume a default identity.
 */
export interface IkengaHostContextExtensions {
  operator?: OperatorIdentity;
}
