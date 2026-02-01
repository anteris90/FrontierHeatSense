# HeatSense Change Request – 02

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
Move the large inline <script> block (~400 lines) to an external file and load it with defer to reduce main-thread blocking and improve TBT / Time to Interactive.

## 3. Requirements

### Backend
- No changes

### Frontend (index.html)
- Locate: the <script> tag at the very end of <body>, right before </body> (contains const API_SINGLE, event listeners, parseSystemInput, displayResult, etc.)
- Actions:
  1. Create folder js/ (if not already present)
  2. Create file js/heatsense.js
  3. Copy the **entire content** inside <script>…</script> (excluding <script> and </script> tags) into js/heatsense.js
  4. In index.html, replace the whole inline <script>…</script> with exactly:
     <script defer src="js/heatsense.js"></script>
  5. Place it right before </body> (same position as before)
- The code already uses event listeners (addEventListener) so defer should be safe — no immediate execution needed

### Model
- Not relevant

## 4. Safety & Risks
- RISK: If code has top-level statements that must run before DOMContentLoaded → breakage (but in this file most logic is inside functions/listeners)
- RISK: Wrong path → JS doesn't load (no search button functionality)
- Do NOT: change any variable names, function names, or logic
- Do NOT: add async instead of defer
- Do NOT: split the script into multiple files

## 5. Verification
- Page loads → console has no "heatsense.js 404" errors
- Click "Check Heat" → works exactly as before
- Performance tab → TBT should be noticeably lower than before

## 6. Output Format
- Unified diff for index.html changes
- Full content of new js/heatsense.js
- Comment at top of js/heatsense.js:  
  // Extracted from index.html – HeatSense optimization #02 – 2026-02