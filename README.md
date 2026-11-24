# ME312 — Physics-Based Simulation and ML Surrogate for Forced Vibration of UAV Propeller Blades

This repository is the complete computational pipeline for the ME312 (Vibrations) course project:
parametric propeller-blade geometry → VSPAERO aerodynamic loading → Euler–Bernoulli cantilever-beam
natural frequency and stiffness → forced-vibration (equivalent SDOF) amplitude → a machine-learning
surrogate that predicts that amplitude instantly for a new design, with calibrated uncertainty.

The single end-to-end ML pipeline lives in **`ME312_surrogate_pipeline_v2.ipynb`**.
The interactive surrogate and all model-card findings are served by **`site/app.py`**.

---

## 1. Project at a glance

| Item | Value |
|---|---|
| Raw VSPAERO/beam rows | 148 (`data/raw/Dataset.xlsx`) |
| Retained after physical screening | 133 (127 `ok` + 6 `watch`) |
| Dropped | 11 hard failures + 4 suspect + 2 numerical overflows |
| Propeller rows (CT > 0) | 77 |
| Windmill rows (CT < 0) | 56 |
| Raw design/operating inputs | 17 (`RPM`, `FreestreamVelocity`, `Blades`, `Diameter`, `Tilt`, 5 chords, 5 twists, `SweepAngle`, `AirfoilThickness`) |
| Learned model head | thrust coefficient `C_T` only |
| Exact (by construction) quantities | `f_n`, `k_tip`, `r = RPM/(60 f_n)`, magnification factor, amplitude formula |
| Validated material | GF-Nylon (PA66-GF30) only; Al/CFRP/PLA shown as illustrative |
| Surrogate speed | ~ms per design (vs. a full VSPAERO run) |

---

## 2. Repository structure and function of each file

The executed pipeline notebook is intentionally kept at the repository root so the end-to-end ML work is
the first thing a reader sees. Supporting material is grouped by type.

```text
.
├── ME312_surrogate_pipeline_v2.ipynb   # final end-to-end ML pipeline (executed)
├── README.md                           # this document
├── requirements.txt                    # pinned Python dependencies
├── data/
│   ├── raw/Dataset.xlsx                # frozen VSPAERO + beam-theory dataset
│   ├── processed/Dataset_screened.xlsx # screened dataset (133 retained rows)
│   └── results/                        # CV, test, summary, material-envelope CSVs
├── models/
│   ├── model_v2.json                   # portable weights/coefficients + scalers
│   └── models_v2.pkl                   # pickled sklearn estimators
├── figures/                            # all six diagnostic/result figures
├── docs/
│   ├── MODEL_CARD_v2.md                # formal model card
│   └── proposal/                       # course proposal (.md and .docx)
├── src/Natural_Frequency_FE_Code       # standalone FE beam code + self-tests
├── vsp/                                # OpenVSP baseline geometry and sweep script
└── site/                               # local interactive surrogate website
```

### Root

| File | Function |
|---|---|
| `README.md` | This document. |
| `requirements.txt` | Pinned Python dependencies for the notebook, pipeline, and website (Python 3.12). |
| `ME312_surrogate_pipeline_v2.ipynb` | **The single ML pipeline notebook** (executed). Screening → FE branch → BET prior → feature engineering → model definitions → repeated CV → metrics → calibration → diagnostics → material envelope → RPM sweep → artifact export. It reads and writes the `data/`, `models/`, and `figures/` folders. |

### `data/`

| File | Function |
|---|---|
| `data/raw/Dataset.xlsx` | Raw dataset: 148 rows of VSPAERO outputs (`Force`, `Moment`, `Power`) plus beam-theory columns (`fn_Hz`, `r_freq_ratio`, `MagnificationFactor`, `ForcePerBlade_N`, `Amplitude_mm`) and the 17 raw inputs. |
| `data/processed/Dataset_screened.xlsx` | Same 148 rows with added `CT`, `CP`, `screen_status`, `screen_reason`. This is what the screening rules produce; 133 rows are retained. |
| `data/results/cv_results_v2.csv` | Repeated 5-fold CV (3 repeats) results for every candidate CT model: CT R²/MAE/sign, amplitude R²/RMSE/within-2x/Spearman/risk AUC, timing. |
| `data/results/test_predictions_v2.csv` | Locked 27-row test-set predictions: `CT`, `Amplitude_mm`, `r`, `CT_hat`, `amp_hat`, `log10_amp_err`. |
| `data/results/summary_v2.csv` | Exactness summary (f_n max rel. error, k_tip max rel. error) and locked-test ranking metrics. |
| `data/results/material_envelope_v2.csv` | Material/damping envelope: median f_n ratio, k ratio, amplitude ratio and p05/p95 amplitude ratios for GF-Nylon / Al 6061 / CFRP / PLA. |

### `models/`

| File | Function |
|---|---|
| `models/model_v2.json` | Portable model artifact: feature sets, Huber coefficients/scalers, ensemble composition, conformal calibration (`q90`, scale), materials, metrics. Source definition consumed by `site/app.py`. |
| `models/models_v2.pkl` | Pickled sklearn objects. Requires the notebook's class definitions to unpickle; provided for offline analysis. |

### `figures/`

| File | Function |
|---|---|
| `figures/fig_v2_calibration.png` | Conformal-interval calibration figure (locked-test coverage). |
| `figures/fig_v2_diagnostics.png` | Predicted-vs-observed CT and amplitude on the locked test. |
| `figures/fig_v2_near_resonance.png` | Leave-one-design-out stress test for the 7 near-resonance rows. |
| `figures/fig_v2_coefficients.png` | Standardised Huber coefficients for the `b13` / `b13w` heads. |
| `figures/fig_v2_material_damping.png` | Material and damping envelope figure. |
| `figures/fig_v2_rpm_sweep.png` | Physics-driven amplitude-vs-RPM curve. |

### `docs/`

| File | Function |
|---|---|
| `docs/MODEL_CARD_v2.md` | Formal model card: architecture, data/scope, performance tables, uncertainty, domain check, material envelope, forensic check, limitations, reproduction command. |
| `docs/proposal/project_proposal.md` | Original course project proposal (objectives, methodology, validation plan, timeline). |
| `docs/proposal/ME312_Vibration_Project_Proposal-1.docx` | Submitted proposal document (same content as above, Word format). |

### `src/` and `vsp/`

| File | Function |
|---|---|
| `src/Natural_Frequency_FE_Code` | Standalone copy of the 30-element Euler–Bernoulli cantilever FE beam (`fe_cantilever`, `blade_fn_and_k`, `magnification`, `add_columns`) and its self-tests. The same code is embedded in the notebook and in `site/app.py`. |
| `vsp/propellerai_baseline.vsp3` | Baseline OpenVSP geometry used to derive the blade station convention (chord stations 0.2/0.4/0.6/0.8/1.0 R, twist 0.2/0.4/0.6/0.75/1.0 R). |
| `vsp/prop-loop.vspscript` | OpenVSP loop script that drives the parametric sweep / VSPAERO runs used to build the dataset. |

### `site/`

| File | Function |
|---|---|
| `site/README.md` | How to run the local website and tab summary. |
| `site/app.py` | Standard-library HTTP server + full inference backend: FE beam, BET prior, Huber ensemble, conformal intervals, domain check, RPM sweep, CSV/JSON endpoints. |
| `site/static/index.html` | Frontend markup: 4 tabs (Run Model, Findings & Metrics, Visualisations, Propeller Geometry). |
| `site/static/style.css` | Styling for the site. |
| `site/static/app.js` | Frontend logic: forms, charts, geometry SVGs, lightbox, API calls. |
| `site/static/vendor/chart.umd.min.js` | Chart.js served locally (no internet required). |
| `site/static/favicon.svg` | Site icon. |
| `site/data/*` | Self-contained copies of the datasets, CSV results, figures and `model_v2.json` served to the browser. The inference backend prefers the canonical files under `../data/` and `../models/` when present, and falls back to these copies. |

---

## 3. Pipeline stages (what the notebook does)

### 3.1 Structural branch — exact FE beam
`fe_cantilever(L, A, I, E, RHO)` (30 elements, hub at `r/R = 0.2`) solves the clamped-free Euler–Bernoulli beam
eigenproblem and returns the first flapwise natural frequency `f_n` (Hz) and tip stiffness `k_tip` (N/m).
`blade_fn_and_k(R, chords, tc, mat)` interpolates chord/twist to element stations and builds `A`, `I`.

Self-tests (in `src/Natural_Frequency_FE_Code` and the notebook) check against an aluminium bar
analytical solution, a SOLIDWORKS published example, and a mesh-convergence study.

### 3.2 Dataset and physical screening
`data/raw/Dataset.xlsx` has 148 rows. `physical_screen()` reproduces the screening rules:
- **hard** — `|C_T| > 5` or `C_P > 5` (no real propeller), or `|F| ≥ 5e9 N` (numerical overflow).
- **suspect** — energy-balance violations (thrust with negative shaft power; extracted power > 1.5× flow work; propulsive efficiency > 1).

Result: 133 retained rows (`ok` + `watch`), 77 propeller + 56 windmill.

### 3.3 Targets
`add_targets()` builds:
- `CT = Force / (ρ_air · n² · D⁴)` (signed thrust coefficient)
- `k_N_per_m` backed out of the amplitude identity
- `log_fn`, `log_k`, `log10_amp`

Exact-chain asserts verify `f_1P = RPM/60`, `r = f_1P/f_n`, `MF = magnification(r)`,
`ForcePerBlade_N = 0.1·|Force|/Blades`, and the amplitude identity.

### 3.4 Feature engineering
17 raw inputs only — solver/beam outputs are never used as inputs (they leak the target).
Engineered features: logs of multiplicative quantities, advance ratios `J`, `J_ax`, tip speed,
blade-shape summaries (mean/root/tip chord, taper, solidity, twist mean/range/slope), and
`logt_over_R`. Feature sets per head: `base3`, `b8`, `b13`, `b13w`, etc.

### 3.5 BET thrust prior
`bet_ct()` is a blade-element strip integral using the actual `.vsp3` station convention.
It provides a physics-informed prior for `C_T` and is an input feature to the CT head.
A BET-vs-VSPAERO audit is reported (robust Huber downstream so outliers are not auto-dropped).

### 3.6 Model
Split (physics-structured) architecture:
```
17 inputs + material(E,ρ) + ζ
  ├─ exact 30-element FE beam  → f_n, k_tip, r = RPM/(60 f_n)
  ├─ BET strip integral + robust Huber C_T ensemble  → Ĉ_T
  └─ exact equivalent-SDOF amplitude
        Amp_mm = 1e3 · (EPS·|Ĉ_T|·ρ_air·n²·D⁴ / B) / k_tip · MF(r, ζ)
```
The learned head is `C_T` only, an equal-weight ensemble of two standardised Huber
regressions (`b13` and `b13w`). A standard ARD-GP (`GP base3`) and a single `b13w` Huber
model are retained as benchmarks. Uncertainty is propagated by Monte Carlo through the
non-linear resonant formula, so bands widen automatically near resonance.

### 3.7 Cross-validation
`cv_oof()` = repeated K-fold (5 folds × 3 repeats) split **by design id**, so a design never
appears in both train and test. Out-of-fold predictions are returned for every row.
Augmented rows (if any) enter training folds only.

### 3.8 Calibration
Raw 90 % intervals under-cover. A split-conformal multiplicative factor `q90 = 0.418` on
scale `s = |Ĉ_T| + 0.2` restores nominal coverage (96.3 % on the locked test).

### 3.9 Diagnostics
Parity, residual-vs-`r`, head-level R² (`f_n`, `k`, `C_T`), feature importance (ARD
length-scales + permutation importance), RPM sweeps, and a forensic check of the
`.vsp3` unsteady-group updates.

### 3.10 Domain check
Ledoit–Wolf Mahalanobis distance on the standardised 17 raw inputs (99 % threshold 33.41)
plus 5-nearest-neighbour distance (95 % training threshold). Unrealistic combinations are flagged.

### 3.11 Material & damping envelope
`C_T` is independent of material in the rigid-blade model; the FE branch and magnification are
recomputed analytically for Al 6061, quasi-isotropic CFRP and PLA (illustrative only).

### 3.12 Why Huber regression and not Gaussian-process regression?

A Gaussian process was the proposal's default choice and is kept in the notebook as the `GP base3`
benchmark. It was not chosen as the final head for five concrete reasons:

1. **The learning problem changed.** The exact FE branch now supplies `f_n`, `k_tip`, `r`, and the
   magnification factor. The ML head only corrects the BET thrust prior, so the target is much closer to
   a low-dimensional, locally linear correction than the original 17-input black-box mapping.
   A linear model with a robust loss is the appropriate complexity for that residual.
2. **The GP under-performs out of sample.** In repeated 5-fold CV (3 repeats), `GP base3` reaches
   CT R² = 0.651 and amplitude R² = 0.585, versus 0.728 and 0.790 for the BET-Huber ensemble.
   On the locked 27-row test the GP amplitude R² is 0.300 versus 0.762 for the ensemble.
   The GP is retained in the tables rather than hidden.
3. **Huber is robust to the non-Gaussian tails.** The dataset contains windmill states, near-resonance
   rows, and a few solver artefacts. A squared-error GP likelihood lets those rows dominate the fit;
   the Huber loss down-weights residuals beyond `epsilon`, which matches the observed heavy-tailed
   residual distribution without deleting data.
4. **Small-sample stability and extrapolation.** With 133 rows and 17 candidate inputs, ARD length-scales
   and kernel hyperparameters are weakly identified; the GP also reverts to its prior mean away from
   training data. The robust linear head extrapolates smoothly along the RPM sweep and its standardised
   coefficients are directly auditable.
5. **Uncertainty is handled explicitly, not by the kernel.** The deployed 90 % intervals come from
   split conformal calibration on out-of-fold residuals (`q90 = 0.418`, scale `|CT| + 0.2`), which gives
   distribution-free coverage (96.3 % on the locked test) and maps linearly into amplitude intervals.
   Relying on a GP's native predictive variance would make coverage conditional on the kernel choice and
   would not automatically survive the non-linear amplitude transformation.

These are not mutually exclusive model families: "Huber" is a loss on a linear regressor, while a GP is
a Bayesian non-parametric regressor. A GP on the BET residual, or a GP member inside the ensemble, is a
reasonable future experiment once more near-resonance and windmill data exist. On the current evidence it
would add cost and variance without improving the held-out metrics.

---

## 4. Model performance

### Repeated 5-fold stratified CV (3 repeats, 133 rows)

| Model | CT R² | CT MAE | sign | Amp R² | Amp RMSE (dex) | within 2× | Spearman | risk AUC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GP base3 (original) | 0.651 | 0.203 | 0.875 | 0.585 | 0.573 | 0.624 | 0.838 | 0.928 |
| Ridge b13w | 0.702 | 0.190 | 0.885 | 0.606 | 0.558 | 0.637 | 0.850 | 0.932 |
| ExtraTrees b13w | 0.688 | 0.181 | 0.890 | 0.692 | 0.495 | 0.669 | 0.869 | 0.915 |
| Huber b13w (single) | 0.727 | 0.151 | 0.932 | 0.783 | 0.414 | 0.797 | 0.929 | 0.962 |
| **BET-Huber ensemble** | **0.728** | **0.151** | **0.930** | **0.790** | **0.408** | **0.807** | **0.928** | **0.963** |

### Locked 27-row test set

| Model | CT R² | CT MAE | sign | Amp R² | Amp RMSE (dex) | within 2× | Spearman | risk AUC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GP base3 (original) | 0.813 | 0.147 | 0.889 | 0.300 | 0.716 | 0.741 | 0.763 | 0.971 |
| Huber b13w (single) | 0.957 | 0.091 | 0.963 | 0.818 | 0.365 | 0.889 | 0.954 | 0.957 |
| **BET-Huber ensemble** | **0.956** | **0.092** | **0.963** | **0.762** | **0.418** | **0.889** | **0.951** | **0.957** |

Bootstrap 95 % CI for the ensemble: Amp R² [0.573, 0.959], CT R² [0.861, 0.966],
risk AUC [0.810, 1.000]. Excluding the single near-zero-amplitude test row, both ensemble
and single `b13w` reach Amp R² = 0.928, within-2× = 0.923.

### Regime breakdown (repeated CV)

| Regime | CT R² | Amp R² | within 2× | Spearman | risk AUC |
|---|---:|---:|---:|---:|---:|
| All rows, ensemble | 0.728 | 0.790 | 0.807 | 0.928 | 0.963 |
| Positive CT, ensemble | 0.577 | 0.888 | 0.866 | 0.953 | 0.973 |
| Negative CT, ensemble | 0.542 | 0.690 | 0.726 | 0.876 | 0.955 |
| Positive-only Huber b8 | 0.645 | **0.896** | **0.865** | 0.954 | 0.973 |
| Negative-only Huber b13w | 0.509 | 0.445 | 0.604 | 0.757 | 0.897 |

**Recommendation:** use propeller mode (CT > 0) for absolute amplitude; use the all-data model
for ranking/resonance risk. Windmill absolute amplitude is lower-confidence.

### Exactness of the structural branch

| Quantity | Max relative error vs. frozen dataset |
|---|---:|
| `f_n` | 1.03e-6 |
| `k_tip` | 1.04e-8 |
| `Amplitude_mm` (exact FE + SDOF, EPS = 0.10, ζ = 0.02) | 2.23e-6 |

### Uncertainty
- Cross-conformal: training OOF residuals, 90 % multiplier `q90 = 0.418` on scale `s = |Ĉ_T| + 0.2`.
- Locked-test coverage: **96.3 %** for CT and **96.3 %** for amplitude.
- Median CT interval width: 0.302; median non-crossing amplitude width: 0.778 decades.
- 12/27 test amplitude intervals cross zero (lower bound 0) — expected when the CT interval contains zero.

### Resonance stress test
Leave-one-design-out for the 7 rows with `|r − 1| < 0.15`:
- median `|log10 amplitude error|`: **0.135 dex**
- **5/7** within 2×
- two negative-CT near-resonance rows (id 130, id 150) are badly mispredicted and are flagged.

### Material & damping envelope (median ratios vs. GF-Nylon)

| Material | f_n ratio | k ratio | median amp ratio | p05 | p95 |
|---|---:|---:|---:|---:|---:|
| GF_Nylon | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| Al_6061 | 1.972 | 7.667 | 0.124 | 0.049 | 2.755 |
| CFRP_QI | 2.581 | 7.778 | 0.119 | 0.042 | 2.920 |
| PLA | 0.655 | 0.389 | 2.704 | 0.563 | 12.423 |

Large p95 values are resonance shifts, not monotonic material improvement.
EPS is linear: 0.05 / 0.10 / 0.20 scales amplitude by 0.5 / 1.0 / 2.0.

### Domain check
- Ledoit–Wolf Mahalanobis on standardised 17 raw inputs; 99 % threshold 33.41.
- 5-NN distance; 95 % training threshold 4.84.
- Locked test: 0 Mahalanobis flags, 1 kNN flag.

---

## 5. The website (`site/`)

Run with:
```bash
cd site
../.venv/bin/python app.py
# open http://localhost:8000  (PORT=8080 to change)
```

Tabs:
- **Run Model** — 17 design inputs, material, damping (ζ), EPS. Returns the BET prior `C_T`,
  ensemble `Ĉ_T`, 90 % conformal interval, exact FE `f_n` and `k_tip`, frequency ratio `r`,
  magnification, SDOF amplitude + interval, and the Mahalanobis / 5-NN domain check.
- **Findings & Metrics** — model-card KPIs, repeated-CV grouped bar chart and full table,
  locked-test CT and amplitude scatter plots, locked-test table, material/damping envelope,
  exactness summary.
- **Visualisations** — interactive RPM sweep for the current design (amplitude and `|Ĉ_T|` vs RPM,
  with design-point and `r = 1` resonance markers) plus the six executed-notebook figures with a
  full-size lightbox.
- **Propeller Geometry** — editable geometry controls, multi-blade top-view planform, chord and
  twist distributions, station table.

Backend endpoints (in `site/app.py`): `/api/predict`, `/api/sweep`, `/api/materials`,
`/api/metrics`, `/api/cv_results`, `/api/test_predictions`, `/api/summary`,
`/api/material_envelope`, `/api/conformal`, `/api/sample`.

---

## 6. Limitations

1. No per-case `.vsp3` files: the `UnsteadyGroup` update audit is blocked.
2. No VSPAERO CSV time histories: force aggregation/time-averaging and 1P harmonic extraction unknown.
3. One RPM per design: full amplitude-vs-RPM curves are not empirically validated; the resonance shape is physics, not learned.
4. Non-rotating FE beam: no centrifugal stiffening.
5. Equivalent SDOF with tip stiffness, not a modal formulation.
6. `EPS = 0.10` is an assumption; only sensitivity is reported.
7. Only GF-Nylon is validated; material values are illustrative.
8. Near-resonance windmill amplitude is not reliable; use ranking/risk there.

---

## 7. Reproduction

Environment (from the repository root):
```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m ipykernel install --user --name me312 --display-name me312
```

Run the notebook:
```bash
cd "/Users/raghav/Downloads/Study/Vibrations prject"
source .venv/bin/activate
jupyter nbconvert --to notebook --execute --inplace \
  --ExecutePreprocessor.kernel_name=me312 \
  --ExecutePreprocessor.timeout=1200 \
  ME312_surrogate_pipeline_v2.ipynb
```

Website:
```bash
cd site
../.venv/bin/python app.py
```

---

## 8. Notes on deleted / consolidated / duplicated files

- The original v1 notebook (`ME312_surrogate_pipeline.ipynb`) was superseded by
  `ME312_surrogate_pipeline_v2.ipynb` and removed; v2 is now the single pipeline notebook and stays at
  the repository root.
- Supporting material is grouped by type: `data/`, `models/`, `figures/`, `docs/`, `src/`, and `vsp/`.
  The notebook defines these paths explicitly and creates the output folders if they are missing.
- OS junk (`.DS_Store`) and Python caches (`__pycache__`, `.ipynb_checkpoints`) are ignored.
- The FE beam code is duplicated intentionally in three places (`src/Natural_Frequency_FE_Code`, the
  notebook, and `site/app.py`) so each can run independently; `site/app.py` and the notebook do not
  import the standalone file.
- `site/data/` is a self-contained runtime copy served by the local website. The backend prefers the
  canonical `data/` and `models/` files when they exist.
