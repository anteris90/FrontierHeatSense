# 🔥 HeatSense - EVE Frontier Heat Prediction System

**📊 Current Model:** Ergod Arctangent v2.0  
**🎯 Performance:** MAE 0.4 Heat (Arctangent v1.0 1.45 Heat)
**📅 Last Updated:** January 31, 2026

---

## 🔗 Quick Links

- **🌐 [Live HeatSense Tool](https://heatsense.pages.dev/)** - Check system heat instantly
- **⚠️ [Dangerous Systems List](dangerous-systems.html)** - 342 high-heat & TRAP systems

---

## 📝 Overview

HeatSense predicts heat signatures in **EVE Frontier** star systems using **Ergod's Arctangent model**. This tool helps players identify safe systems and avoid deadly heat traps where temperatures never drop to survivable levels.

### ✨ What's New in v1.0

- 🎯 **New Model:** Ergod Arctangent formula with physically-validated parameters
- 📈 **46% Improvement:** MAE reduced from 2.70 to 1.45 Heat
- ✅ **Better Accuracy:** 97% of predictions within ±5 Heat
- ⚠️ **342 Dangerous Systems:** Updated high-heat system catalog
- 🔬 **Validated:** Tested on 520 measurements across all star classes

---

## 🧮 Model Specification

### Formula

```
H(D) = A · (2/π) · arctan((π/2) · λ / D)

where:
  λ = K · T^α · R^β
```

### Parameters / OLD Values

| Parameter | Value | Description |
|-----------|-------|-------------|
| **K** | 1.287 × 10⁻¹¹ | 🔢 Scaling constant |
| **α** | 1.686 | 🌡️ Temperature exponent (≈ 5/3) |
| **β** | 1.226 | 📏 Radius exponent (≈ 5/4) |
| **A** | 99.02 | 🔥 Maximum heat signature |

### Physical Interpretation

- 🌡️ **T** = Star temperature (Kelvin)
- 📏 **R** = Star radius (kilometers)
- 📍 **D** = Distance from star (light-seconds)
- 🔥 **H** = Heat signature (0-100 scale)

The arctangent function provides:
1. 🛡️ **Bounded behavior** - Heat saturates near stars (doesn't exceed 100)
2. 📉 **Smooth decay** - Natural heat decrease with distance
3. ✅ **Physical validity** - Parameters match theoretical predictions

---

## 📊 Performance Metrics

### Validation Dataset
- 📈 **Total Measurements:** 520 (301 new + 219 original)
- 🌟 **Unique Systems:** 82 stellar systems
- 🎨 **Star Classes:** All 6 classes covered (B/A/F/G/K/M)

### Accuracy

| Metric | Value | Icon |
|--------|-------|------|
| **Mean Absolute Error (MAE)** | 1.45 Heat | 🎯 |
| **Median Error** | 0.93 Heat | 📊 |
| **Within ±2 Heat** | 69.1% | ✅ |
| **Within ±5 Heat** | 97.0% | ✅✅ |
| **Within ±10 Heat** | 99.7% | ✅✅✅ |

### 📈 Comparison to Previous Models

| Model | MAE | Improvement |
|-------|-----|-------------|
| v8.0 Ergod Exponential | 14.24 | 📍 baseline |
| v8.2 Two-Tier Power Law | 2.70 | 📈 81% better |
| **✨ Arctangent v1.0** | **1.45** | **🚀 46% better than v8.2** |

---

## 🌌 System Statistics

### Overall Distribution
- 🌟 **Total Systems:** 24,023
- ✅ **Safe Systems (Heat < 40):** 20,605
- ⚠️ **Moderate Systems (40-80):** 2,829
- 🔥 **Dangerous Systems (80-90):** 436
- ☠️ **Critical/TRAP Systems (90+):** 153

### 🔥 High-Heat Systems (Heat ≥ 85)
- **Total:** 342 systems
- **📋 [View Complete List](dangerous-systems.html)**

### 🏆 Hottest Systems (Top 3)
1. 🥇 **OTG-5R2** (K1 star) - Heat: 98.7
2. 🥈 **N.0XT.B29** (A8 star) - Heat: 98.3
3. 🥉 **E09-RJ1** (M2 star) - Heat: 97.5

---

## ✨ Features

### 🔍 Main Interface
- **🔎 System Search:** Look up any EVE Frontier system by name
- **📝 Batch Search:** Check multiple systems at once (paste routes from Frontier Map)
- **🎨 Heat Categories:** Visual indicators
  - ✅ Safe (< 40 Heat)
  - ⚠️ Moderate (40-80 Heat)
  - 🔥 Dangerous (80-90 Heat)
  - ☠️ TRAP (90+ Heat)
- **ℹ️ Star Information:** Temperature, radius, spectral class displayed

### 🔧 Debug Mode
Test custom stellar parameters without system lookup:
- 🌡️ **Temperature Input:** Any star temperature in Kelvin
- 📍 **Distance Input:** Test distance in LS or AU
- 🔄 **Unit Toggle:** Switch between light-seconds and astronomical units
- ⚡ **Local Calculation:** Instant results using Arctangent model

---

## 🛠️ Usage Examples

### Example 1: Single System Search
```
🔎 Input: O3H-1FN

📊 Result:
   System: O3H-1FN
   Star Class: G5
   Temperature: 5,729 K
   Coldest Point: 1.78 AU (890 LS)
   Heat: 40.2
   Status: ⚠️ MODERATE
```

### Example 2: Batch Route Check
```
📝 Input: O3H-1FN, I9T-0FN, OFC-3FN

📊 Results:
   ┌─────────────┬──────────┬─────────┬──────────┐
   │ System      │ Class    │ Heat    │ Status   │
   ├─────────────┼──────────┼─────────┼──────────┤
   │ O3H-1FN     │ G5       │ 40.2    │ ⚠️ MOD   │
   │ I9T-0FN     │ K2       │ 23.5    │ ✅ SAFE  │
   │ OFC-3FN     │ M1       │ 87.3    │ 🔥 DANGER│
   └─────────────┴──────────┴─────────┴──────────┘
```

### Example 3: Debug Mode Test
```
🔧 Debug Mode:
   Temperature: 6000 K
   Distance: 100 LS
   Unit: LS

⚡ Result: Heat ~87.5 (DANGEROUS)
```

---

## 📈 Model History

### Evolution Timeline
1. **🔬 v8.0 (Initial)** - Ergod's exponential decay model
   - MAE: 14.24 Heat
   - First community model

2. **⚡ v8.2 (Dec 2025)** - Two-tier power law
   - MAE: 2.70 Heat
   - 81% improvement
   - Separate formulas for hot/cool stars

3. **✨ v1.0 (Jan 2026)** - Arctangent model
   - MAE: 1.45 Heat
   - 46% additional improvement
   - Unified formula with physical parameters
   - **Current production model**

---

## 🧪 Technical Details

### 🌟 Data Coverage

| Star Class | Systems | Temperature Range | Radius Range |
|------------|---------|-------------------|--------------|
| 🔵 B | 225 | 11,001 - 32,645 K | 1.3 - 3.8 Mkm |
| 💠 A | 805 | 7,801 - 10,983 K | 0.8 - 2.1 Mkm |
| ⚪ F | 1,682 | 6,200 - 7,799 K | 0.6 - 1.5 Mkm |
| 🟡 G | 2,649 | 5,300 - 6,200 K | 0.5 - 1.2 Mkm |
| 🟠 K | 6,486 | 4,000 - 5,300 K | 0.4 - 0.9 Mkm |
| 🔴 M | 12,174 | 1,671 - 4,000 K | 0.08 - 0.6 Mkm |

### ⚠️ Known Limitations
- 📊 **Data Coverage:** Only main sequence stars available in EVE Frontier
- ❌ **Missing Types:** No Red Giants or Hot Dwarfs
- 🔗 **Multicollinearity:** High correlation (r=0.96) between temperature and radius
- 📏 **Validation Range:** Temperatures 1,700 - 20,500 K, distances 0 - 60 AU

### ⚙️ Optimization Notes
- 📦 **Worker Size:** 1.41 MB (66% reduction from unoptimized)
- 💾 **Format:** Ultra-compact array storage `[id,class,temp,radius,au,ls,heat,status]`
- ⚡ **API Speed:** O(1) hash table lookups, no per-request calculations
- 🌐 **CORS:** Enabled for all origins

---

## 🎯 Future Improvements

### 🔬 Research Priorities
- 📍 Collect off-diagonal stellar data (Red Giants, Hot Dwarfs)
- 🧪 Validate extrapolation beyond main sequence
- 🌟 Test on binary star systems
- 📈 Refine parameters with additional measurements

---

## � Development

### Project Structure

```
FrontierHeatSense/
├── index.html          # Production HTML (refactored with external files)
├── index_dev.html      # Backup: Original inline version
├── css/
│   └── styles.css      # All application styles
├── js/
│   └── app.js          # Main application logic
├── db/
│   ├── ships.json      # Ship data for jump calculations
│   └── [other data files]
└── README.md           # This file
```

### Architecture Overview

- **Frontend-only:** No build process, pure HTML/CSS/JS
- **Modular CSS:** External stylesheet with CSS variables for theming
- **Vanilla JS:** No frameworks, event-driven architecture
- **Progressive Enhancement:** Core functionality works without ship data
- **Accessibility:** Screen reader support, keyboard navigation, semantic HTML

### Key Features

- **System Heat Lookup:** Single or batch system queries via API
- **Route Analysis:** Jump-by-jump heat calculations with ship parameters
- **Ship Integration:** Optional ship selection for feasibility analysis
- **Responsive Design:** Mobile-optimized table layouts
- **Error Handling:** Graceful degradation on API failures

### Development Workflow

1. Edit `index.html` for HTML changes
2. Modify `css/styles.css` for styling
3. Update `js/app.js` for functionality
4. Test locally, then deploy to production

**Stamping version before deploy**

If you want the site to show the git short hash in the footer and use it for cache-busting, run:

```powershell
node scripts/stamp-version.js
```

Call this in your CI/deploy pipeline so `index.html` is updated with the current commit hash.

**Note:** `index_dev.html` is a backup of the original inline version. All active development happens in `index.html`.

---

## �👥 Credits

**🧮 Model:** Ergod (Arctangent heat-signature model)  
**💻 Implementation:** Anteris with Claude assistance  
**📊 Data:** EVE Frontier community (520 measurements, 82 systems)  
**🔬 Validation:** All 6 star classes (B/A/F/G/K/M)

---

## 📜 License

This tool is provided for **EVE Frontier community use**. Model and data are open for analysis and improvement.

---

## 📞 Contact & Feedback

For bugs, suggestions, or additional measurements:
- 🐛 Submit issues via GitHub
- 📊 Share measurements with the community
- ⚠️ Report dangerous systems not in the catalog
- 💬 Discuss improvements in EVE Frontier Discord

---

## 📚 Additional Resources

- 📖 **[Full Validation Report](ERGOD_ARCTANGENT_MODEL_REPORT.md)** - Detailed analysis
- 💾 **[System Data (CSV)](system_heat_arctangent_v1.csv)** - All systems
- ⚠️ **[Dangerous Systems (CSV)](dangerous_systems_arctangent_v1.csv)** - High-heat list
- 📝 **[Development Log](CONVERSATION_MEMORY_LOG.md)** - Session history

---

**📅 Last Updated:** January 30, 2026  
**🔬 Model Version:** Arctangent v1.0  
**✅ Status:** Production Ready  
**🎯 Accuracy:** 97% within ±5 Heat

---

<div align="center">

### 🔥 Stay Safe in the Frontier! 🔥

**Made with ❤️ for the EVE Frontier Community**

</div>
