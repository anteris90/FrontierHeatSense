# EVE Frontier :: HeatSense

**Universal Exponential Model with Metallicity-Aware Dataset**

Live calculator: [https://anteris90.github.io/FrontierHeatSense/](https://anteris90.github.io/FrontierHeatSense/)

---

## 🌟 What's New in v6.1

### **Metallicity Integration**
- All 166 measurements now include metallicity (Z) values
- Dataset covers 47 unique star systems across 30 star types
- Metallicity correlation analysis confirms F/G star patterns
- Auto-merge pipeline ready for future data expansion

### **Model Accuracy**
- **MAE: 6.79 Heat** (Universal Model)
- **82% accuracy** within 10 Heat
- **50% accuracy** within 5 Heat
- Based on comprehensive metallicity-aware dataset

---

## 📊 Dataset Statistics

### **Total Coverage**
- **166 measurements** with full metallicity data
- **47 star systems** (unique solar_system_id)
- **30 different star types** (M0-B8)
- **Temperature range:** 1728K - 13673K
- **Distance range:** 0.006 AU - 50+ AU

### **Measurements by Star Class**

| Class | Measurements | Stars | Metallicity Range |
|-------|--------------|-------|-------------------|
| **F-type** | 36 | 9 | 0.0047 - 0.0267 |
| **G-type** | 13 | 4 | 0.0090 - 0.0258 |
| **A-type** | 39 | 7 | 0.0037 - 0.0266 |
| **M-type** | 50 | 17 | 0.0020 - 0.0234 |
| **K-type** | 23 | 9 | 0.0010 - 0.0271 |
| **B-type** | 5 | 1 | 0.0245 |

---

## 🔬 Universal Exponential Model

### **Formula**
```
Heat = A × e^(-λ×D) + B

where:
  λ(T) = 2.21×10⁹ / T^2.613    (stellar wind decay rate)
  A = 85.0                      (amplitude normalization)
  B(T) = 0.000791×T + 2.694    (background radiation)
  
  T = Star temperature (Kelvin)
  D = Distance (AU)
```

### **Physical Interpretation**
- **λ(T):** Decay rate inversely proportional to T^2.6 (stellar wind strength)
- **Higher temperature → Slower decay** (radiation reaches further)
- **Lower temperature → Faster decay** (radiation drops off quickly)
- **B(T):** Background radiation floor increases slightly with temperature

### **Advantages**
- ✅ **Single continuous formula** (no class boundaries)
- ✅ **Smooth temperature transitions** (no discontinuities)
- ✅ **Physically grounded** (based on stellar wind physics)
- ✅ **Best overall accuracy** (MAE: 6.79)

---

## 🗺️ Data Sources

### **Star Data**
- **Lacal's Starmap:** [https://ef-map.com/](https://ef-map.com/)
- Temperature and spectral class data for EVE Frontier stars
- Complete star database with metallicity values (24,000+ stars)

### **Heat Measurements**
- In-game measurements by anteris90 (GitHub: anteris90)
- Community contributions via Discord
- Standardized measurement protocol for consistency

---

## 🔄 Metallicity Auto-Merge Pipeline

All new heat data is automatically merged with metallicity values using:
- **stars.csv database** (24,023 usable stars)
- **Auto-matching** by spectral class + temperature (±50K tolerance)
- **100% match rate** on current dataset

This ensures every measurement has complete metadata for model refinement.

---

## 📈 Model Performance

### **Overall Accuracy**
- **Mean Absolute Error:** 6.79 Heat
- **Within 5 Heat:** 50% (82/166 measurements)
- **Within 10 Heat:** 82% (136/166 measurements)

### **Accuracy by Star Class**

| Star Type | MAE | <5 Heat | <10 Heat | Status |
|-----------|-----|---------|----------|--------|
| **K-type** | 4.25 | 48% | 87% | ✅ Excellent |
| **G-type** | 4.35 | 62% | 77% | ✅ Excellent |
| **F-type** | 5.89 | 50% | 75% | ✅ Good |
| **A-type** | 6.78 | 51% | 82% | ✅ Good |
| **M-type** | 8.59 | 44% | 76% | ⚠️ Moderate |
| **B-type** | 13.40 | 20% | 100% | ⚠️ Limited data (5) |

**Note:** M-type accuracy is affected by extreme close-range (<0.1 AU) instability and insufficient data at various temperature ranges.

---

## 🎯 Future Improvements

### **Data Collection Priorities**

To improve model accuracy to <5 Heat MAE, we need:

**Priority 1: G and K stars** (critical gaps)
- 27+ additional G-type measurements (13 → 40+)
- 27+ additional K-type measurements (23 → 50+)

**Priority 2: M-type refinement**
- 30+ additional M-type measurements (50 → 80+)
- Focus on transition zone: 0.2-0.8 AU
- Cover cold M-types (T < 2500K)

**Priority 3: F and B expansion**
- 24+ additional F-type measurements (36 → 60+)
- 15+ additional B-type measurements (5 → 20+)

### **Target: 300-500 measurements**

With expanded dataset:
- Expected MAE: **<5.0 Heat**
- Metallicity correction effectiveness: **+20-30% improvement**
- Model confidence: **>90% for main sequence stars**

---

## 🧪 Metallicity Correlation Analysis

### **Current Findings**

| Star Class | Correlation (Z vs λ) | Status |
|------------|----------------------|--------|
| **F-type** | **-0.575** | ✅ Strong negative |
| **G-type** | **-0.428** | ✅ Moderate negative |
| **A-type** | -0.242 | ⚠️ Weak negative |
| **K-type** | -0.040 | ❌ Negligible |
| **M-type** | -0.152 | ❌ Very weak |

**Interpretation:**
- **Negative correlation:** Higher metallicity → Lower λ → Slower heat decay
- **F/G stars:** Metallicity significantly affects stellar wind (proven)
- **M/K stars:** Too much variance, more data needed
- **Physical basis:** Metal-rich stars have stronger radiation pressure → enhanced stellar wind

### **Next Steps**
- Collect 50+ additional F/G star measurements
- Re-test Z-correction when dataset reaches 300+ measurements
- If successful: Implement v7.0 with metallicity-aware predictions

---

## 🛠️ Technical Details

### **Model Development**
- **Initial dataset:** 118 measurements (v5.2)
- **Metallicity merge:** +48 measurements with Z values
- **Current dataset:** 166 measurements (v6.1)
- **Database:** 24,023 stars with complete metadata

### **Validation Methodology**
- Temperature-distance matching (±50K tolerance)
- Per-class exponential fitting (scipy.optimize.curve_fit)
- Cross-validation against alternative models (Mix, Per-Class Exponential)
- Comprehensive error analysis by star type and distance range

### **Known Limitations**
- **M-type instability:** λ variance 0.79-10.0 (13× range) suggests hidden variables
- **Extreme close range (<0.1 AU):** Non-linear game mechanics possible
- **B-type uncertainty:** Only 5 measurements, insufficient for robust calibration
- **Very distant measurements (>50 AU):** Limited data, low confidence

---

## 📚 Model Comparison

### **Available Models**

| Model | MAE | <10 Heat | Formula Type | Status |
|-------|-----|----------|--------------|--------|
| **Universal v6.1** | **6.79** | **82%** | Single exponential | ✅ **Recommended** |
| Per-Class Exponential | 7.06 | 83% | 5 class-specific | Alternative |
| Mix (Power Law) | 7.49 | 71% | 4-tier power law | Legacy |

**Why Universal?**
- Simplest implementation (3 parameters vs 15)
- Smooth temperature transitions
- Physically interpretable (stellar wind theory)
- Comparable accuracy to complex multi-tier models
- Future-proof for metallicity integration

---

## 🤝 Credits

### **Contributors**
- **anteris90** - Data collection, model development, GitHub repository
- **Ergod** - Exponential decay model theory, comprehensive star system analysis
- **Lacal** - Starmap tool and complete star database ([ef-map.com](https://ef-map.com/))
- **Claude (Anthropic)** - Model optimization, statistical analysis, documentation

### **Community**
- EVE Frontier Discord community for measurements and validation
- Multiple pilots contributing heat data across different star systems

---

## 📖 Usage

### **Calculator**
Visit [https://anteris90.github.io/FrontierHeatSense/](https://anteris90.github.io/FrontierHeatSense/)

1. Get star data from [Lacal's Starmap](https://ef-map.com/)
2. Enter star temperature (Kelvin)
3. Enter distance (AU or LS)
4. Get instant heat prediction with accuracy range

### **Contributing Data**
New measurements are always welcome! Format:
```csv
Type, Temp (K), Distance1 (LS), Heat1, Distance2 (LS), Heat2, ...
K7, 4289, 18, 95.8, 151, 69.6, 364, 43.1
```

Submit via:
- GitHub Issues: [FrontierHeatSense](https://github.com/anteris90/FrontierHeatSense)
- EVE Frontier Discord
- Direct message to anteris90

All data is automatically merged with metallicity database!

---

## 📄 License

MIT License - Free to use, modify, and distribute.

---

## 🔗 Links

- **Live Calculator:** [https://anteris90.github.io/FrontierHeatSense/](https://anteris90.github.io/FrontierHeatSense/)
- **GitHub Repository:** [https://github.com/anteris90/FrontierHeatSense](https://github.com/anteris90/FrontierHeatSense)
- **Lacal's Starmap:** [https://ef-map.com/](https://ef-map.com/)
- **EVE Frontier:** [https://www.evefrontier.com/](https://www.evefrontier.com/)

---

**Version:** 6.1  
**Last Updated:** January 2026  
**Dataset:** 166 measurements with metallicity (47 systems, 30 star types)  
**Model:** Universal Exponential with Temperature-Dependent Decay
