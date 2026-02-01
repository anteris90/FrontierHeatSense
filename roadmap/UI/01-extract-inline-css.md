# HeatSense Change Request – 01

You are a senior frontend engineer doing a surgical change.
Follow these rules exactly:
1. Only modify the parts explicitly mentioned in the change request.
2. Do NOT reformat, re-indent, or clean up unrelated code.
3. Do NOT remove comments.
4. Do NOT change class names, IDs, variable names, or string literals.
5. Produce ONLY a unified diff (-u) showing old → new lines.
6. If you are unsure about any implication — write a comment // RISK: ... and leave original code unchanged.

## 1. Request Type
Optimization

## 2. Goal
Remove the large inline <style> block (~800 lines of CSS) from index.html and move it to an external file.  
This reduces HTML size, enables better caching, improves FCP/LCP, and makes future style changes easier.

## 3. Requirements

### Backend
- No changes

### Frontend (index.html)
- Locate: the single <style> tag inside <head> that contains a very long block of CSS rules (starts with * {margin:0;padding:0;box-sizing:border-box} and ends with the last @keyframes or footer rule)
- Do NOT touch any other <style> tags (there should be none), style="" attributes, or the Clarity script
- Actions:
  1. Create folder css/ (if not already present)
  2. Create file css/heatsense.css
  3. Copy the **entire content** inside <style>…</style> (excluding the <style> and </style> tags themselves) into css/heatsense.css
  4. In index.html, replace the whole <style>…</style> block with exactly:
     <link rel="stylesheet" href="css/heatsense.css">
  5. Place this <link> right after the last <meta> tag or before the Clarity <script>, but still inside <head>
- Do NOT add media queries, !important flags, or change any selectors

### Model
- Not relevant

## 4. Safety & Risks
- RISK: If paths are wrong → styles don't load (white page or broken design)
- RISK: If content is truncated → missing rules (e.g. footer or animation disappear)
- Do NOT: minify, remove comments, change class names, reorder rules
- Do NOT: add version query (?v=1) yet — do it manually later if cache issues appear

## 5. Verification
- Open page in browser → dev tools → Elements → head should have <link rel="stylesheet" href="css/heatsense.css">
- Sources tab → css/heatsense.css should contain all previous inline rules
- Page should look 100% identical (colors, layout, animations, hover effects)

## 6. Output Format for Implementation
- Provide a unified diff (-u) showing changes in index.html
- Provide the full content of the new css/heatsense.css file
- Add comment at top of css/heatsense.css:  
  /* Extracted from index.html – HeatSense optimization #01 – 2026-02 */

Prepared for: HeatSense maintainer / LLM code generation