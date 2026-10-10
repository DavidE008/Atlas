<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Load the Solana SDK's self-contained browser bundle only when wallet verification is requested; keep runtime SDK imports out of SSR to avoid unsupported websocket dependencies.
- Initialize one Google Map per mount and share its callback-based API loader; update markers separately so selection cannot recreate the map or overwrite pending callbacks.

## Solana Developer MCP

For Solana-related work, prefer the Solana Developer MCP tools over model memory. The remote server is available at `https://mcp.solana.com/mcp` and requires no API key. In Codex CLI, configure it with:

```sh
codex mcp add solana-mcp --url https://mcp.solana.com/mcp
```

Use `list_sections` first for non-trivial Solana questions to find relevant documentation sources and sections. Use `get_documentation` for canonical docs; use `Solana_Documentation_Search` or `Solana_Expert__Ask_For_Help` for focused questions, errors, or API usage.

Whenever you write or modify Solana program Rust, call `program_autofixer` before returning the code. Apply its suggested fixes, then call it again. Repeat until `require_another_tool_call_after_fixing` is false. The tool accepts `code`, optional `filename`, and optional `framework` (`auto`, `anchor`, or `pinocchio`).
