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
- vite.config.ts strips devtools' data-tsd-source attributes from src/game/ files: React Three Fiber crashes on dashed props it can't resolve.
- src/game/Atmosphere.tsx exposes dev-only window.__lights (sun/hemi/env/night/clock) and window.__grass (the meadow InstancedMesh) so live lighting and grass scale can be measured from the browser.
