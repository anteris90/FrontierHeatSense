# HeatSense Change Request – 04

You are a senior frontend engineer doing a surgical change.
Follow these rules exactly:
1. Only modify the parts explicitly mentioned in the change request.
2. Do NOT reformat, re-indent, or clean up unrelated code.
3. Do NOT remove comments.
4. Do NOT change class names, IDs, variable names, or string literals.
5. Produce ONLY a unified diff (-u) showing old → new lines.
6. If you are unsure about any implication — write a comment // RISK: ... and leave original code unchanged.

## 1. Request Type
UI Update / Optimization

## 2. Goal
Increase touch target size of the main search button for better mobile usability.

## 3. Requirements

### Frontend
- Locate: the .btn class definition inside the (now external) css/heatsense.css or original inline style
- Update / add these properties:
  min-height: 54px;
  padding: 16px 24px;
- If already has padding, increase it (do not decrease existing values)

## 5. Verification
- On mobile view (dev tools) → button tap area should be noticeably larger
- No layout shift or overflow caused

## 6. Output Format
- Unified diff for css/heatsense.css (or inline style if not yet extracted)