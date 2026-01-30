# HeatSense - EVE Frontier Heat Prediction System

**Current Model:** Ergod Arctangent v1.0  
**Performance:** MAE 1.45 Heat (46% better than v8.2 Power Law)  
**Last Updated:** January 30, 2026

---

## Overview

HeatSense predicts heat signatures in EVE Frontier star systems using Ergod's Arctangent model. This tool helps players identify safe systems and avoid deadly heat traps where temperatures never drop to survivable levels.

### What's New in v1.0

- **New Model:** Ergod Arctangent formula with physically-validated parameters
- **46% Improvement:** MAE reduced from 2.70 to 1.45 Heat
- **Better Accuracy:** 97% of predictions within ±5 Heat
- **342 Dangerous Systems:** Updated high-heat system catalog
- **Validated:** Tested on 520 measurements across all star classes

---

## Model Specification

### Formula

```
H(D) = A · (2/π) · arctan((π/2) · λ / D)

where:
  λ = K · T^α · R^β
```

### Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **K** | 1.287 × 10⁻¹¹ | Scaling constant |
| **α** | 1.686 | Temperature exponent (≈ 5/3) |
| **β** | 1.226 | Radius exponent (≈ 5/4) |
| **A** | 99.02 | Maximum heat signature |

### Physical Interpretation

- **T** = Star temperature (Kelvin)
- **R** = Star radius (kilometers)
- **D** = Distance from star (light-seconds)
- **H** = Heat signature (0-100 scale)

---

## Performance Metrics

### Validation Dataset
- **Total Measurements:** 520 (301 new + 219 original)
- **Unique Systems:** 82 stellar systems
- **Star Classes:** All 6 classes covered (B/A/F/G/K/M)

### Accuracy

| Metric | Value |
|--------|-------|
| **Mean Absolute Error (MAE)** | 1.45 Heat |
| **Median Error** | 0.93 Heat |
| **Within ±5 Heat** | 97.0% |
| **Within ±10 Heat** | 99.7% |

### Comparison to Previous Models

| Model | MAE | Improvement |
|-------|-----|-------------|
| v8.0 Ergod Exponential | 14.24 | baseline |
| v8.2 Two-Tier Power Law | 2.70 | 81% better |
| **Arctangent v1.0** | **1.45** | **46% better than v8.2** |

---

## System Statistics

### Overall Distribution
- **Total Systems:** 24,023
- **Safe Systems (Heat < 40):** 20,605
- **Moderate Systems (40-80):** 2,829
- **Dangerous Systems (80-90):** 436
- **Critical/TRAP Systems (90+):** 153

### High-Heat Systems (Heat ≥ 85)
- **Total:** 342 systems
- **View List:** [dangerous-systems.html](dangerous-systems.html)

### Hottest Systems (Top 3)
1. **OTG-5R2** (K1 star) - Heat: 98.7
2. **N.0XT.B29** (A8 star) - Heat: 98.3
3. **E09-RJ1** (M2 star) - Heat: 97.5

---

## Features

### Main Interface
- **System Search:** Look up any EVE Frontier system by name
- **Batch Search:** Check multiple systems at once
- **Heat Categories:** Visual indicators (Safe, Moderate, Dangerous, TRAP)
- **Star Information:** Temperature, radius, spectral class

### Debug Mode 🔧
Test custom stellar parameters:
- **Temperature Input:** Any star temperature in Kelvin
- **Distance Input:** Test distance in LS or AU
- **Unit Toggle:** Switch between light-seconds and astronomical units
- **Local Calculation:** Instant results using Arctangent model

---

## Credits

**Model:** Ergod (Arctangent heat-signature model)  
**Implementation:** Anteris with Claude assistance  
**Data:** EVE Frontier community (520 measurements)

---

## License

Provided for EVE Frontier community use. Model and data open for analysis.

---

**Last Updated:** January 30, 2026  
**Model Version:** Arctangent v1.0  
**Status:** Production Ready ✅
