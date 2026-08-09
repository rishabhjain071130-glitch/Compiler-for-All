# Phase 2: UI/UX Foundation

## Objective

Build a premium, modern, responsive CSS-based layout for the Compiler for All workspace. Design the shell layout containing editor panels, console inputs, execution controls, and output streams using vanilla CSS.

---

## Requirements

- Implement a full-screen layout utilizing CSS Grid and Flexbox.
- Establish a sleek dark theme with a glassmorphic aesthetic (subtle borders, transparent background filters, drop shadows, and neon accent colors for interactive states).
- Create a split-pane layout:
  - **Left Pane**: Code editor panel.
  - **Right Pane**: Split vertically into a **Console Input** (stdin box) and a **Console Output** panel (tabbed view: Output, Compilation details, and Stats).
- Implement a bottom action bar with:
  - An auto-detection status pill showing which language is current.
  - A vibrant "Run" button with loading spinners, active/hover transitions, and state triggers.
- The UI must be fully responsive, switching to a stacked column layout on tablets and mobile screens.

---

## Technical Considerations

- **Typography**: Import a modern font (e.g., _Inter_ or _Outfit_ from Google Fonts).
- **CSS Variables**: Store all theme attributes (backgrounds, borders, glass filters, core gradients, and interactive glows) inside a central `:root` stylesheet in `index.css`.
- **Aesthetics**: Follow the Web Application Development Guidelines for rich aesthetics. Avoid raw primary colors (e.g., pure red/blue). Instead, use custom HSL ranges (e.g., slate grays, deep emerald green accents, warm amber alerts).

---

## Files/Components Expected

- `client/src/index.css`: CSS Variables and core layout definitions.
- `client/src/components/Layout.tsx`: Parent shell managing split sizes and panel configurations.
- `client/src/components/Navbar.tsx`: Top bar with logo and system status indicators.
- `client/src/components/ControlBar.tsx`: Lower status bar containing the Run button and auto-detect pill.
- `client/src/components/Console.tsx`: Tabbed panel managing input (stdin) textareas and output blocks.

---

## Acceptance Criteria

1.  The web interface renders cleanly at any desktop size and resizes smoothly to smaller viewports.
2.  Pressing tabs in the console changes active panel states with a sliding/fade micro-animation.
3.  The "Run" button changes state to "Executing..." with a loading spinner when clicked, resetting after a dummy timeout (e.g., 2 seconds).
4.  No third-party component libraries (e.g., Material-UI, Chakra) are used. The layout is implemented via semantic HTML and vanilla CSS.

---

## Things the agent must not do

- **DO NOT** install `@monaco-editor/react` or Monaco Editor packages. Use a styled native `<textarea>` placeholder for the editor.
- **DO NOT** implement backend execution APIs. Use mock state flags for running actions.
- **DO NOT** write the code-based language detection engine. The language pill should show a static default ("Detecting...") or react to simple hardcoded textarea hooks.
- **DO NOT** use absolute layout sizing that breaks when resized below 1024px width.
