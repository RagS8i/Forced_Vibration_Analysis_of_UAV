# ME312 surrogate v2 — model card

**Artifact:** `ME312_surrogate_pipeline_v2.ipynb` (executed)
**Single pipeline notebook:** `ME312_surrogate_pipeline_v2.ipynb` (the earlier v1 notebook was consolidated/removed)
**Dataset:** `data/raw/Dataset.xlsx` (SHA-256 `4d2b39a83dfb7ed42caec5adc71df48a2fbc2ea22900a6bc4077106540c229a3`)
**Environment:** Python 3.12.15; numpy 2.5.5; pandas 3.1.1; scipy 1.18.1; scikit-learn 1.9.1; matplotlib 3.11.2; kernel `me312`

## Architecture

```
17 raw inputs + material (E, rho) + zeta
        |
        +--> exact 1-D FE beam (30 elements, hub at r/R=0.2)
        |       -> f_n, k_tip, r = RPM/(60 f_n)
        |
        +--> BET strip integral + robust Huber CT ensemble
        |       -> C_T_hat
        |
        +--> exact equivalent-SDOF amplitude
                Amp = 1e3 * (EPS * |C_T_hat| * rho_air * n^2 * D^4 / B)
                      / k_tip * MF(r, zeta)
```

The learned head is CT only. It is an equal-weight ensemble of two standardized Huber regressions:

- `b13`: BET prior, axial/tangential advance ratios, tilt, Beta34 (`tw75`), mean chord, solidity, sweep, log thickness, blade count, log diameter, tip Mach, and local angle of attack at 0.75R;
- `b13w`: the same with `r^2`-thrust-weighted chord and solidity.

The ensemble hedges between the two physically motivated geometry summaries. A single b13w model and a standard ARD-GP are retained as benchmarks.

### Why Huber rather than Gaussian-process regression

The proposal named Gaussian-process/kriging regression as the intended surrogate, and a `GP base3`
model is still evaluated. The deployed head is a robust linear regression because:

- the exact FE branch removes the structural dynamics, so the learned quantity is a low-dimensional
  correction to the BET prior rather than a full 17-input mapping;
- the GP under-performs on held-out data: repeated-CV CT R² 0.651 vs 0.728 and amplitude R² 0.585 vs
  0.790; locked-test amplitude R² 0.300 vs 0.762;
- windmill, near-resonance, and solver-artefact rows create heavy-tailed residuals, which the Huber loss
  down-weights while a squared-error GP likelihood does not;
- with 133 rows, ARD length-scales and kernel hyperparameters are weakly identified, and the GP reverts
  to its prior mean when extrapolating along an RPM sweep;
- uncertainty is supplied by split conformal calibration on out-of-fold residuals (96.3 % locked-test
  coverage), so the result does not depend on a kernel's native predictive variance.

Huber is a loss on a linear model, not a separate model family, so a GP on the BET residual remains a
reasonable future experiment if more near-resonance and windmill data become available.

## Exact structural branch

Maximum relative error versus the frozen dataset:

| Quantity | Max relative error |
|---|---:|
| `f_n` | 1.03e-6 |
| `k_tip` | 1.04e-8 |
| `Amplitude_mm` (exact FE + SDOF, EPS=0.10, zeta=0.02) | 2.23e-6 |

The dataset column `ForcePerBlade_N` is already the EPS-scaled per-blade force. The amplitude identity used in the notebook is:

`Amp_mm = 1e3 * ForcePerBlade_N / k_tip * MF`.

## Data and scope

- 148 workbook rows; 11 hard failures, 4 suspect failures, **133 retained**.
- 77 positive-CT (propeller) rows, 56 negative-CT (windmill) rows.
- Only GF-Nylon (`E=9.0e9 Pa`, `rho=1370 kg/m^3`, `zeta=0.02`) exists in the dataset.
- Near-resonance coverage: 1 row with `|r-1|<0.05`, 2 within 0.10, 7 within 0.15.

## Performance

### Repeated 5-fold stratified CV (3 repeats, 133 rows)

| Model | CT R² | CT MAE | sign | Amp R² | Amp RMSE (dex) | within 2x | Spearman | risk AUC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GP base3 (original) | 0.651 | 0.203 | 0.875 | 0.585 | 0.573 | 0.624 | 0.838 | 0.928 |
| Ridge b13w | 0.702 | 0.190 | 0.885 | 0.606 | 0.558 | 0.637 | 0.850 | 0.932 |
| ExtraTrees b13w | 0.688 | 0.181 | 0.890 | 0.692 | 0.495 | 0.669 | 0.869 | 0.915 |
| Huber b13w (single) | 0.727 | 0.151 | 0.932 | 0.783 | 0.414 | 0.797 | 0.929 | 0.962 |
| **BET-Huber ensemble** | **0.728** | **0.151** | **0.930** | **0.790** | **0.408** | **0.807** | **0.928** | **0.963** |

### Locked 27-row test set

| Model | CT R² | CT MAE | sign | Amp R² | Amp RMSE (dex) | within 2x | Spearman | risk AUC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GP base3 (original) | 0.813 | 0.147 | 0.889 | 0.300 | 0.716 | 0.741 | 0.763 | 0.971 |
| Huber b13w (single) | 0.957 | 0.091 | 0.963 | 0.818 | 0.365 | 0.889 | 0.954 | 0.957 |
| **BET-Huber ensemble** | **0.956** | **0.092** | **0.963** | **0.762** | **0.418** | **0.889** | **0.951** | **0.957** |

Bootstrap 95% CI for the ensemble amplitude R²: **[0.573, 0.959]**; CT R²: **[0.861, 0.966]**; risk AUC: **[0.810, 1.000]**.

The locked test contains one near-zero-amplitude row (`Amplitude_mm < 1e-3`). Excluding that single row, the ensemble and single b13w both reach **Amp R² = 0.928**, within-2x **0.923**. The ensemble is retained because its repeated-CV amplitude R² equals the best single model and it avoids selecting on the 27-row test.

### Regime breakdown (repeated CV)

| Regime | CT R² | Amp R² | within 2x | Spearman | risk AUC |
|---|---:|---:|---:|---:|---:|
| all rows, all-data ensemble | 0.728 | 0.790 | 0.807 | 0.928 | 0.963 |
| positive CT, all-data ensemble | 0.577 | 0.888 | 0.866 | 0.953 | 0.973 |
| negative CT, all-data ensemble | 0.542 | 0.690 | 0.726 | 0.876 | 0.955 |
| positive-only Huber b8 | 0.645 | **0.896** | **0.865** | 0.954 | 0.973 |
| negative-only Huber b13w | 0.509 | 0.445 | 0.604 | 0.757 | 0.897 |

**Recommendation:** use propeller mode (`CT > 0`) for absolute amplitude; use the all-data model for ranking/resonance risk. Negative-thrust/windmill absolute amplitude is explicitly lower-confidence.

## Uncertainty

- Cross-conformal calibration: training OOF residuals, 90% multiplier `q90 = 0.418` on scale `s = |CT_hat| + 0.2`.
- Locked-test coverage: **96.3%** for CT and **96.3%** for amplitude.
- Median CT interval width: 0.302. Median non-crossing amplitude width: 0.778 decades.
- 12/27 test amplitude intervals cross zero (lower bound 0); this is expected when the CT interval contains zero.

## Resonance stress test

Leave-one-design-out for the 7 rows with `|r-1| < 0.15`:

- median `|log10 amplitude error|`: **0.135 dex**;
- **5/7** within 2x;
- two negative-CT near-resonance rows (`id 130`, `id 150`) are badly mispredicted. These are flagged, not hidden.

The resonance location `r = RPM/(60 f_n)` is exact; the amplitude near resonance is limited by the CT correction in windmill states and by the absence of near-resonance training data.

## Domain check

- Ledoit-Wolf Mahalanobis on the standardized 17 raw inputs; 99% threshold 33.41.
- 5-NN distance; 95% training threshold 4.84.
- Locked test flags: 0 Mahalanobis, 1 kNN. Unrealistic combinations are flagged for review.

## Material and damping envelope

CT is independent of material and zeta in the rigid-blade VSPAERO model. The FE branch and SDOF magnification are recomputed analytically. Only GF-Nylon is validated; Al 6061, quasi-isotropic CFRP, and PLA properties are illustrative.

At the material default zeta:

| Material | median f_n ratio vs GF | median k_tip ratio | median amplitude ratio | p05 | p95 |
|---|---:|---:|---:|---:|---:|
| GF_Nylon | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| Al_6061 | 1.972 | 7.667 | 0.124 | 0.049 | 2.755 |
| CFRP_QI | 2.581 | 7.778 | 0.119 | 0.042 | 2.920 |
| PLA | 0.655 | 0.389 | 2.704 | 0.563 | 12.423 |

The large p95 values are resonance shifts, not a claim of monotonic material improvement. EPS is linear: 0.05/0.10/0.20 scales amplitude by 0.5/1.0/2.0.

## Forensic check (blocked)

Baseline `propellerai_baseline.vsp3` has `RotorDia=0.17`, `Rx=-0.81925`, `Rz=0.57343` (34.99° tilt). The loop script updates `Diameter` and `Y_Rel_Rotation` on `PropGeom`, but only updates `RPM` explicitly on `<UnsteadyGroup>`.

No generated `Results/results_*/prop_setup_*.vsp3` files are present, so it cannot be verified whether `Update()` propagated `RotorDia`, `Rx`, and `Rz`. The notebook contains a ready scanner; run it after generating one case.

## Remaining limitations

1. No per-case `.vsp3` files: `UnsteadyGroup` update audit blocked.
2. No VSPAERO CSV time histories: force aggregation/time-averaging and 1P harmonic extraction unknown.
3. One RPM per design: full amplitude-vs-RPM curves are not empirically validated; the resonance shape is physics, not learned.
4. Non-rotating FE beam: no centrifugal stiffening.
5. Equivalent SDOF with tip stiffness, not a modal formulation.
6. `EPS=0.10` is an assumption; only sensitivity is reported.
7. Only GF-Nylon is validated; material values are illustrative.
8. Near-resonance windmill amplitude is not reliable; use ranking/risk there.

## Files

- `ME312_surrogate_pipeline_v2.ipynb` — executed main deliverable, kept at the repository root.
- `data/results/cv_results_v2.csv`, `data/results/test_predictions_v2.csv`, `data/results/summary_v2.csv`, `data/results/material_envelope_v2.csv`.
- `models/model_v2.json` — portable coefficients/scalers/conformal calibration.
- `models/models_v2.pkl` — sklearn objects; requires the notebook class definitions to unpickle.
- `figures/fig_v2_*.png` — calibration, diagnostics, near-resonance, coefficients, material/damping, RPM sweep.
- `data/raw/Dataset.xlsx`, `data/processed/Dataset_screened.xlsx`.

## Reproduction

```bash
cd "/Users/raghav/Downloads/Study/Vibrations prject"
source .venv/bin/activate
jupyter nbconvert --to notebook --execute --inplace \
  --ExecutePreprocessor.kernel_name=me312 \
  --ExecutePreprocessor.timeout=1200 \
  ME312_surrogate_pipeline_v2.ipynb
```
