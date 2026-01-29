# EVE Frontier HeatSense v8.0

System heat calculator for safe navigation and mining operations.

🌐 **Live:** https://anteris90.github.io/FrontierHeatSense/

---

## Quick Start

**Check single system:**
```
Input: O3H-1FN
Output: Heat 0.0 (SAFE)
```

**Check route:**
Paste route from [EVE Frontier Map](https://ef-map.com/) → Get heat table with warnings

---

## Heat Scale

| Heat | Status | Description |
|------|--------|-------------|
| **<40** | ✅ **SAFE** | No heat concerns |
| **40-80** | ⚠️ **MODERATE** | Manageable with cooling |
| **80-90** | 🔥 **DANGEROUS** | High risk, prepare cooling |
| **90+** | ☠️ **TRAP** | Extreme heat, escape difficult |

---

## The Model

**Ergod's Physics Formula:**
```
H = 100 × exp(-λ × D)
λ = 9,000,000 / R^φ × e^(-T/5778)
```

- **Accuracy:** MAE 6.93 Heat (75% within ±10)
- **Coverage:** 24,023 systems
- **Based on:** 219 in-game measurements

**Credit:** Model by [Ergod](https://thoughtfolio.xyz/All+to+Avoid+Heat+Traps%2C+Exponential+Heat-Signature+Decay+Model)

---

## Tech

- **Frontend:** GitHub Pages (free)
- **Backend:** Cloudflare Workers (free)
- **Database:** 2.3 MB embedded
- **Cost:** $0

---

## Contributing

Need measurements from:
- G-type stars (13 → 50+ needed)
- K-type stars (27 → 50+ needed)

**Submit measurements:** [HeatSense Data - EH-SDM Research](https://docs.google.com/spreadsheets/d/1H9lASYdNVlgM3pH2fTpMSMG0vW-dX1t3QmDSh1L85LA/edit?usp=sharing)

---

## Deploy

```bash
# Backend
cd backend && wrangler deploy

# Frontend
git push origin main
```

---

## License

MIT

**Author:** Anteris  
**Model:** Ergod
