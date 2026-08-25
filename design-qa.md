# Iteration 4 Design QA

- source visual truth path: `design/assets/iteration-4/dashboard-reference.png`
- implementation screenshot path: `reports/assets/iteration-4/01-dashboard-desktop-1536x1024.jpg`
- viewport: 1536×1024 CSS px
- source pixels: 1536×1024
- implementation pixels: 1536×1024
- density normalization: 1:1 pixels at device scale 1; no resampling for the final comparison
- state: unauthenticated `#home`, Fabric connection status visible
- full-view comparison: `reports/assets/iteration-4/qa-comparison-final.jpg`
- focused comparison: `reports/assets/iteration-4/qa-focused-final.jpg` (heading/actions/summary and dense evidence table)

## Required fidelity surfaces

- Fonts and typography: system sans family, controlled 14–16 px UI scale, strong 48 px product heading, mono limited to ledger identifiers. Weight, wrapping and hierarchy are consistent with the reference.
- Spacing and layout rhythm: top bar, 278 px sidebar, main alignment, five-column summary, evidence table and footer follow the reference proportions. Cards use consistent 10–12 px radii and restrained elevation.
- Colors and visual tokens: white/light foundation, near-black primary action, jade trust state, gray-blue technical icons and subtle top gradient match the selected direction with accessible contrast.
- Image and icon quality: the reference contains no raster content asset beyond standard UI icons. Implementation uses the official Phosphor Vue icon library; no emoji, CSS-drawn icons, handwritten SVG or placeholder graphics are used.
- Copy and content: internal project/competition/demo language and invented people were removed. Remaining data maps to existing ChainGrade records and real Fabric configuration.

## Comparison history

### Pass 1 — blocked

- [P2] Footer and global runtime status were outside the 1440×1024 first viewport.
  - Evidence: `reports/assets/iteration-4/01-dashboard-desktop-v1.jpg` and `reports/assets/iteration-4/qa-comparison-v1.jpg`.
  - Fix: changed dashboard minimum height to reserve both the 74 px top bar and 74 px footer, then captured at the source's exact 1536×1024 size.

### Pass 2 — passed

- Post-fix evidence: `reports/assets/iteration-4/01-dashboard-desktop-1536x1024.jpg`, `reports/assets/iteration-4/qa-comparison-final.jpg`, and `reports/assets/iteration-4/qa-focused-final.jpg`.
- The implementation intentionally uses four rows instead of the reference's five because it only presents existing project records; this is a product-data constraint, not visual drift.
- The global top navigation retains direct role entry links instead of invented help/account controls; this preserves the existing working product journey.
- No actionable P0, P1 or P2 differences remain.

## Browser verification

- Primary interactions: homepage public verification CTA, student navigation, mobile menu open/close.
- Responsive states: 1536×1024 desktop and 390×844 mobile.
- Mobile metrics: `innerWidth=390`, `scrollWidth=375`; no horizontal overflow.
- Desktop metrics: `innerWidth=1536`, `scrollWidth=1536`, `scrollHeight=1024`; footer visible.
- Browser console warning/error: 0.

## Follow-up polish

- [P3] A future live query endpoint can replace the home evidence snapshot with ledger-derived records without changing the visual system.

final result: passed
