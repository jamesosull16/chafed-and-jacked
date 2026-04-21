# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Nutrition Calculation — Formulas & Citations

The macro calculator (`src/lib/macroCalculator.js`) uses peer-reviewed formulas for energy expenditure and macronutrient targeting.

### BMR (Basal Metabolic Rate)

**Primary — Katch-McArdle** (when body fat % is available):
```
BMR = 370 + (21.6 × lean_mass_kg)
```

**Fallback — Mifflin-St Jeor (1990)**:
```
Male:   BMR = 10·kg + 6.25·cm − 5·age + 5
Female: BMR = 10·kg + 6.25·cm − 5·age − 161
```

> Mifflin, M.D. et al. "A new predictive equation for resting energy expenditure in healthy individuals." *Am J Clin Nutr* 51(2):241–7, 1990.

### Run Calorie Expenditure

**HR-based — Keytel et al. (2005)**, standard form:
```
Male:   kcal/min = (−55.0969 + 0.6309·HR + 0.1988·kg + 0.2017·age) / 4.184
Female: kcal/min = (−20.4022 + 0.4472·HR − 0.1263·kg + 0.074·age)  / 4.184
```

**Extended form** (when VO2max is available):
```
Male:   kcal/min = (−95.7735 + 0.6309·HR + 0.1988·kg + 0.2017·age + 0.6488·VO2max) / 4.184
Female: kcal/min = (−59.3954 + 0.4472·HR − 0.1263·kg + 0.074·age  + 0.4654·VO2max) / 4.184
```

**Distance fallback**: `kcal = miles × weight_lbs × 0.63` (ACSM metabolic equation approximation)

> Keytel, L.R. et al. "Prediction of energy expenditure from heart rate monitoring during submaximal exercise." *J Sports Sci* 23(3):289–97, 2005.

### TDEE
```
TDEE = (BMR × 1.2) + run_kcal + strength_kcal
```

### Macronutrient Targets (Session-Aware)

| Macro | Rule | Citation |
|-------|------|----------|
| **Protein** | 1.7 g/kg baseline; 2.0 g/kg if run ≥ 90 min; 2.2 g/kg if cutting; phase-adjusted for deload (1.6) and taper (1.8) | Jager et al., ISSN Position Stand, 2017; Helms et al., 2014 |
| **Carbs** | Duration-based: <45 min → 5 g/kg; 45–90 min → 6; 90–180 min → 8; >180 min → 10; +1 g/kg if lifting same day. Mileage fallback when duration unavailable. | IOC Consensus on Sports Nutrition, 2011 |
| **Fat** | Remainder after protein + carb kcal (÷ 9), floored at 0.8 g/kg | IOC guidelines for endurance athletes |
| **Deficit** | Phase-scaled: build 400, deload 300, taper/peak 250, race 0 kcal | IOC RED-S Consensus, 2018 |

### Formula Selection

The `source` field in the return value indicates which formula was used:
- `keytel` — HR-based (standard Keytel)
- `keytel_vo2` — HR-based with VO2max correction
- `distance` — distance-only fallback (lower confidence)

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
