# ME312 Propeller Vibration Surrogate — Website

A local website for the v2 surrogate: run the BET-Huber model, inspect model-card findings,
metrics and diagnostics, view all generated figures, and explore propeller geometry.

## Run
```bash
cd site
../.venv/bin/python app.py
```
Then open http://localhost:8000 (or set `PORT=8080`).

## Tabs
- **Run Model** — 17 design inputs, material, damping (zeta), and EPS. Returns the BET prior CT,
  ensemble CT̂, 90% conformal interval, exact FE f_n and k_tip, frequency ratio r, magnification,
  SDOF amplitude + interval, and a Mahalanobis / 5-NN domain check.
- **Findings & Metrics** — model-card KPIs, repeated-CV grouped bar chart and full table,
  locked-test CT and amplitude scatter plots, locked-test table, material/damping envelope,
  and exactness summary.
- **Visualisations** — interactive RPM sweep for the current design (amplitude and |CT̂| vs RPM,
  with design-point and r = 1 resonance markers) plus the six executed-notebook figures with a
  full-size lightbox.
- **Propeller Geometry** — editable geometry controls, multi-blade top-view planform, chord and
  twist distributions, and a station table.

## Files
- `app.py` — standard-library HTTP server + model inference (FE beam, BET, Huber ensemble,
  conformal intervals, domain check, RPM sweep).
- `static/index.html`, `static/style.css`, `static/app.js` — frontend.
- `static/vendor/chart.umd.min.js` — Chart.js served locally (no internet needed).
- `data/` — model coefficients, CSV results, figures and datasets.
