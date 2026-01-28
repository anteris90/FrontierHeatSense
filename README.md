# EVE Frontier Heat Calculator

A scientifically calibrated heat prediction tool for EVE Frontier, helping pilots navigate star systems safely by estimating external heat based on star temperature and distance.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://anteris90.github.io/FrontierHeatSense/)
[![Version](https://img.shields.io/badge/version-5.2-blue)](https://github.com/anteris90/FrontierHeatSense)
[![Accuracy](https://img.shields.io/badge/accuracy-68%25%20%3C10%20Heat-orange)](https://github.com/anteris90/FrontierHeatSense)

## 🌟 Features

- **4-Tier Prediction Model** - Different formulas optimized for M/K/G, F, and A-type stars
- **100 Heat Game Cap** - Reflects observed in-game mechanics
- **95% Accuracy for A-type Stars** - Specialized distance-split model for white stars
- **118 Measurements** - Calibrated from extensive multi-planet data collection
- **Real-time Calculation** - Instant heat estimates as you type
- **Visual Heat Zones** - Color-coded safety indicators (Safe/High Load/Dangerous/Supercritical)

## 🚀 Quick Start

### Option 1: Use Online
Visit [https://anteris90.github.io/FrontierHeatSense/](https://anteris90.github.io/FrontierHeatSense/)

### Option 2: Run Locally
```bash
git clone https://github.com/anteris90/FrontierHeatSense.git
cd FrontierHeatSense
# Open index.html in your browser
```

## 📊 How It Works

The calculator uses a **4-tier statistical model** based on 118 measurements from 31 star systems:

### Model Breakdown

| Star Type | Temperature Range | Formula | Accuracy |
|-----------|------------------|---------|----------|
| **Cool (M/K/G)** | <6000K | `26.46 × (T/3000)^1.03 / d^0.33` | ~50% <10 Heat |
| **Medium (F)** | 6000-7500K | `79.67 × (T/3000)^0.03 / d^0.45` | 73% <10 Heat |
| **Hot-Close (A)** | ≥7500K, d<3AU | `55.88 × (T/3000)^0.41 / d^0.06` | 95% <10 Heat |
| **Hot-Far (A)** | ≥7500K, d≥3AU | `62.81 × (T/3000)^0.90 / d^0.59` | 95% <10 Heat |

**Note:** T = temperature in Kelvin, d = distance in AU

### Game Cap
Heat values are capped at **100 Heat** to reflect observed in-game behavior at extremely close distances (<0.15 AU).

## 📈 Performance Statistics

**Overall Model Performance:**
- Mean Absolute Error: **7.49 Heat**
- 68% of predictions within ±10 Heat
- 36% of predictions within ±5 Heat

**By Star Class:**
- A-type stars: **4.43 MAE** (95% <10 error)
- F-type stars: **6.88 MAE** (73% <10 error)
- G-type stars: **8.83 MAE** (50% <10 error)
- K-type stars: **8.74 MAE** (25% <10 error)
- M-type stars: **10.49 MAE** (50% <10 error)

## 🎮 Usage Guide

### Basic Usage
1. Enter the star's **Temperature** (in Kelvin)
2. Enter your **Distance** from the star (in AU)
3. Click **Calculate** or press Enter

### Understanding Results

**Heat Zones:**
- 🟢 **Safe** (<30 Heat): Minimal thermal load
- 🟡 **High Load** (30-60 Heat): Elevated heat, manageable
- 🔴 **Dangerous** (60-80 Heat): Jump range significantly reduced
- ☠️ **Supercritical** (80+ Heat): Severe risk, very short jump range

**Jump Heat Limit:** Remember that jumping adds heat. Stay well below **150 total Heat** to avoid getting stuck!

### Tips for Accuracy
- **F-type stars**: Most accurate (temperature barely matters, distance is key)
- **A-type stars <3 AU**: Extremely accurate (distance barely matters)
- **K/M-type stars <0.5 AU**: Less accurate due to limited data
- **B-type stars**: Use with caution (limited calibration data)

## 🔬 Technical Details

### Data Collection
Data collected from **31 unique star systems** across temperature range **1728K - 13673K**:
- 18 M-type measurements
- 12 K-type measurements
- 8 G-type measurements
- 34 F-type measurements
- 41 A-type measurements
- 5 B-type measurements

### Model Development
The model evolved through multiple iterations:
- **v1.0-v2.2**: Explored exponential decay and inverse square models
- **v3.0**: Discovered temperature-only model superiority over luminosity
- **v4.0**: Implemented dual-model (Cool vs Hot stars)
- **v5.0**: Added 3-tier model with F-type separation
- **v5.1**: Distance-split A-type stars (<3 AU vs ≥3 AU)
- **v5.2**: Added 100 Heat game cap (current)

### Key Findings
1. **Luminosity is not required** - Temperature alone predicts heat well
2. **Star class matters less than temperature** - Continuous temperature scale works better than discrete classification
3. **A-type stars behave differently at close range** - Distance effect minimal <3 AU
4. **F-type stars show unique pattern** - Temperature exponent near zero (~0.03)
5. **Game enforces 100 Heat cap** - Observed across multiple extreme-close measurements

## 🛠️ Development

### Tech Stack
- Pure HTML/CSS/JavaScript (no dependencies)
- Statistical model calibrated using Python (scipy, pandas, numpy)
- Responsive design with dark space theme

### Model Calibration
Models were fitted using least-squares optimization (`scipy.optimize.minimize`) to minimize Mean Absolute Error across all measurements.

### Contributing
Data contributions welcome! If you have measurements from star systems (especially B-type or extreme close K/M-type), please open an issue with:
- Star type and temperature
- Distance(s) in LS or AU
- Observed Heat value(s)

## ⚠️ Limitations

- **B-type stars**: Limited data (only 5 measurements), predictions less reliable
- **Extreme close range** (<0.15 AU): Fewer measurements, higher uncertainty
- **Edge cases**: New star types or unusual configurations may not be accurately predicted
- **Game updates**: Model based on current game mechanics (as of January 2025)

## 📜 Version History

### v5.2 (Current) - January 2025
- Added 100 Heat game cap
- Improved K-type star accuracy (-2.41 MAE)
- Visual indicator when cap is applied
- Overall MAE: 7.49

### v5.1 - January 2025
- Distance-split A-type model (<3 AU vs ≥3 AU)
- 95% accuracy for A-type stars
- Overall MAE: 7.93

### v5.0 - January 2025
- 3-tier model (Cool/Medium/Hot)
- F-type separation
- Overall MAE: 9.96

### Earlier versions
- v1.0-v4.0: Initial development and model exploration

## 📞 Contact & Links

- **GitHub**: [anteris90/FrontierHeatSense](https://github.com/anteris90/FrontierHeatSense)
- **Live Demo**: [https://anteris90.github.io/FrontierHeatSense/](https://anteris90.github.io/FrontierHeatSense/)
- **Issues**: [Report bugs or request features](https://github.com/anteris90/FrontierHeatSense/issues)

## 📄 License

This project is open source and available for use by the EVE Frontier community.

## 🙏 Acknowledgments

- EVE Frontier community for gameplay data and testing
- Statistical analysis powered by Python scientific stack
- Claude AI for development assistance and model optimization

---

**Fly safe, capsuleer! o7**

*Note: This tool provides estimates based on empirical data. Actual in-game values may vary. Always maintain safe margins when operating near heat limits.*
