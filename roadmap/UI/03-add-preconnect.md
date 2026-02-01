# HeatSense Change Request – 03

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
Add preconnect to the API domain to reduce latency of the first fetch call to the backend Worker.

## 3. Requirements

### Backend
- No changes

### Frontend (index.html)
- Locate: inside <head>, preferably after the last <meta> tag and before any <script> or <link rel="stylesheet">
- Add exactly one line:
  <link rel="preconnect" href="https://systems-test.heatsense.workers.dev" crossorigin>
- Optional second line (if keeping Clarity):
  <link rel="dns-prefetch" href="https://www.clarity.ms">

## 4. Safety & Risks
- Almost zero risk — preconnect is safe and ignored by older browsers
- Do NOT add prefetch (only preconnect)

## 5. Verification
- View page source → head contains the preconnect link
- Network tab → first request to systems-test.heatsense.workers.dev should show earlier connection start

## 6. Output Format
- Unified diff showing the added line(s) in <head>