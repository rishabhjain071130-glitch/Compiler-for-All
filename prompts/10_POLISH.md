# Phase 10: Polish

## Objective
Apply advanced visual styling, loading states, timeline notifications, and performance tuning. Optimize bundle splits for Monaco Editor and enhance component loading skeletons.

---

## Requirements
*   Implement visual polish in CSS:
    *   Add hover transitions (using `cubic-bezier` timing curves) to buttons, tabs, and input panels.
    *   Build a dynamic, glassmorphic loading skeleton to cover the Monaco pane prior to initialization.
*   Create a detailed execution status timeline component:
    *   Graphically represent the execution progress in stages: `Detecting language` ➔ `Compiling source` ➔ `Executing binary` ➔ `Completed`.
    *   Transition stage states with fade/slide micro-animations.
*   Enforce optimization rules:
    *   Use `React.memo` or layout hooks to prevent unnecessary re-rendering of Monaco when unrelated panel states update.
    *   Configure Vite (`vite.config.ts`) chunk splitting to package Monaco Editor separately from the application code, maximizing cache hit rates.
*   Improve execution output details:
    *   Render an execution metrics badge showing compile time, run time, and warning banners if RAM utilization exceeds 80% of the 64MB limit.
    *   Handle backend offline/timeout events by rendering a sliding, red alert banner at the top of the interface.

---

## Technical Considerations
*   Maintain accessibility (contrast ratios, clean focus highlights) while keeping the visual designs vibrant.
*   Ensure that all animations are optimized for GPU rendering (using properties like `transform` and `opacity` instead of layout metrics like `margin` or `width`).

---

## Files/Components Expected
*   `client/vite.config.ts`: Chunk splitting definitions.
*   `client/src/components/StatusTimeline.tsx`: Progress stage manager.
*   `client/src/components/SkeletonLoader.tsx`: Glass-like container loaders.
*   `client/src/index.css`: Keyframe transitions, color rules, and system overlays.

---

## Acceptance Criteria
1.  Monaco Editor displays a sleek skeleton placeholder while loading, swapping to the active editor with a smooth 150ms opacity transition.
2.  Switching console tabs has no lag, and borders fade/glow softly.
3.  Vite production build outputs multiple small chunks rather than a single massive bundle.
4.  Disconnecting from the server or simulating a network drop triggers a slide-down banner that automatically vanishes once connection is restored.

---

## Things the agent must not do
*   **DO NOT** install Tailwind CSS or tailwind-derived utility libraries. Styling must remain in pure CSS.
*   **DO NOT** alter the security sandbox runtime command structures or child execution timeouts.
