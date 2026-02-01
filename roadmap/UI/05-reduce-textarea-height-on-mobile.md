# HeatSense Change Request – 05

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
Make the textarea smaller on mobile screens to save vertical space.

## 3. Requirements

### Frontend
- In css/heatsense.css (or inline style), add at the end:
  @media (max-width: 640px) {
    #systemInput {
      height: auto;
      font-size: 1em;
      min-height: 100px;
    }
  }
- Do NOT override existing rows attribute or desktop styles

## 5. Verification
- Resize browser < 640px wide → textarea becomes shorter
- Text still readable, no content cut off

## 6. Output Format
- Unified diff showing the added @media block