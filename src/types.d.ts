// Ambient declarations for the Paper web-app globals we touch inside
// `page.evaluate`. These live in the browser page, not in Node — this file just
// teaches the type checker about them.

export {};

declare global {
  interface Window {
    /** Lazy promise that resolves to Paper's MCP handlers instance. */
    resolveMCPHandlers?: Promise<any> | undefined;
    /** The handlers instance, once built. */
    mcpHandlers?: any;
  }

  interface Navigator {
    /** WebMCP API Paper sniffs for; we stub it to enter WebMCP mode. */
    modelContext?: any;
  }
}
