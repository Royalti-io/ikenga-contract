/**
 * `@ikenga/contract/engine` — engine adapter surface.
 *
 * Exports BOTH the legacy `Engine` shape (`./adapter`) and the ACP-shaped
 * surface (`./acp`) side-by-side for one deprecation cycle. Legacy types
 * carry `@deprecated` JSDoc pointing at the ACP path. Shared error types
 * live in `./errors`.
 */

export * from './adapter.js';
export * from './acp.js';
export * from './errors.js';
export * from './portability.js';
export * from './subagent-transcoder.js';
