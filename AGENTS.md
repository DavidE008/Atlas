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
