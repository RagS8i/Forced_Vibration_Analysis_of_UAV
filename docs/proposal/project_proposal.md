ME312 - Vibrations
Course Project Proposal
Physics-Based Simulation and Machine Learning Surrogate Modelling for Forced Vibration Response Prediction in UAV Propeller Blades
Group Members
[Aditya Upadhyay -24135006], [Akshat Kumar - 24135165], [Raghav Sharma - 24135169], [Sujal Singh - 24134036], [Shrinivas Ghirnikar - 24134012]
Course
ME312 - Vibrations
Instructor
Mr. Deepak Kumar
Department
Department of Mechanical Engineering
Date
31 August 2026

a) Project Title
Physics-Based Simulation and Machine Learning Surrogate Modelling for Forced Vibration Response Prediction in UAV Propeller Blades
b) Materials and Methods
The project is entirely computational and does not involve any physical experimentation or fabrication. All analysis was performed with free and open-source or free-tier software tools, listed below:
	•	OpenVSP - Parametric propeller blade geometry definition (radius, chord, and twist distribution along the blade).
	•	VSPAERO (bundled with OpenVSP) - Aerodynamic force/loading simulation on the defined blade geometry, using panel/vortex-lattice methods.
	•	Python (NumPy, SciPy, Pandas) - Structural natural frequency calculation (Euler-Bernoulli cantilever beam theory), forced vibration response computation, and dataset assembly.
	•	Google Colab - Cloud-based execution environment for all Python work, enabling seamless collaboration across the group.
	•	Scikit-learn (or equivalent, e.g. Gaussian Process/Kriging regression libraries) - Training the machine learning surrogate model on the generated dataset.
	•	Overleaf (LaTeX, IEEEtran template) - Preparation of the final report/paper.
	•	UIUC Propeller Database (publicly available wind-tunnel test data) - Used as an external reference dataset to validate simulation outputs in the absence of in-house experimental facilities.
The project is a computational and theoretical study, integrating theoretical modelling (theory of beam vibration), computational simulation (OpenVSP/VSPAERO) and data-driven modelling (machine learning).


c) Objective
To develop a computational pipeline that merges structural vibration theory with aerodynamic loading simulation to predict the forced vibration response of UAV propeller blades at varying design parameters and operating speeds, and to train a machine learning surrogate model capable of instantly predicting this response for new blade designs without repeating the full simulation. Specifically:
	•	To determine natural frequencies of propeller blades of varying geometry and material using Euler-Bernoulli cantilever beam theory.
	•	To simulate aerodynamic loading on the same blade geometries at varying RPM using OpenVSP/VSPAERO.
	•	To compute the forced vibration response amplitude of each design using standard forced-vibration theory (magnification factor, damping ratio).
	•	To validate all simulation outputs against publicly available experimental (wind-tunnel) data.
	•	To generate a dataset of blade designs and their vibration response and train a machine learning surrogate model to predict the vibration response directly from the design parameters.
d) Methodology
1. Literature Review
Review of published work on the propeller/rotor blade vibration analysis, blade element/aerodynamic loading theory, forced vibration response of rotating structures and existing machine learning surrogate modelling approaches for structural dynamics problems (including recent work on ML based prediction of propeller blade natural frequencies). This review will be referenced in such a way that the novelty of the proposed project will be clear, which is to extend previous surrogate models only considering natural frequencies, to predict the full forced-resonance vibration severity through the coupling of structural dynamics and aerodynamic loading.
2. Mathematical Modelling (Equations of Motion)
Structural side - the propeller blade is modelled as a cantilever beam. Natural frequency of the nth mode:
fₙ = (βₙ² / 2π) × √(EI / (ρ·A·L⁴))
where E = Young's modulus, I = second moment of area, ρ = density, A = cross-sectional area, L = blade length, and βₙ is the standard mode-dependent constant for a cantilever beam.
Aerodynamic excitation - the blade experiences repeating aerodynamic forcing at multiples of the rotational frequency (1P, 2P, ...):
f_exc = (RPM / 60) × n
Forced vibration response - the vibration amplitude at any operating condition is obtained from the standard single-degree-of-freedom forced vibration equation:
Amplitude = (F₀ / k) × [1 / √((1 − r²)² + (2ζr)²)]
where F₀ is the aerodynamic force magnitude (from VSPAERO simulation), k is the beam stiffness, r = f_exc / fₙ is the frequency ratio, and ζ is an assumed damping ratio representative of lightly damped blade structures (0.01–0.05, based on literature values).
3. Simulation Plan
	•	Define candidate blade geometries (varying length, chord, taper ratio, thickness, and material - Aluminium, Carbon Fiber, and PLA) in OpenVSP.
	•	Run VSPAERO on each geometry across a sweep of RPM values to obtain aerodynamic force output.
	•	Compute natural frequency and forced vibration response amplitude for each design/RPM combination using the Python model.
	•	Generate a dataset of approximately 50–150 distinct blade designs (sampled via Latin Hypercube Sampling for efficient coverage of the design space), each evaluated across multiple RPM points.
4. Data Collection and Analysis
For each simulated design, the following data will be recorded in a structured dataset: input parameters (blade length, chord, taper, thickness, material, RPM) and output results (natural frequency, excitation frequency, frequency ratio, resonance amplitude). This dataset will be analysed to identify trends - e.g., which design parameters most strongly influence resonance risk - and will be used to train and evaluate a machine learning surrogate model (Gaussian Process/Kriging regression, chosen for its suitability to moderate-sized simulation datasets), assessed using standard regression metrics (R², RMSE) and benchmarked for prediction speed against the full simulation pipeline.
5. Comparison with Existing Data / Validation
	•	External validation: candidate propeller geometries from the publicly available UIUC Propeller Database (wind-tunnel-tested thrust and power coefficients) will be recreated in OpenVSP and simulated under matching conditions; simulated results will be compared against the measured data, with percentage error reported.
	•	Internal validation: mesh/panel convergence checks in VSPAERO, and cross-checking aerodynamic force estimates against an independently coded Blade Element Theory calculation.
	•	Structural model validation: the Python beam natural-frequency code will be checked against a hand-calculated analytical example prior to use in the full study.
e) Expected Outcomes
	•	Natural frequencies (first and second bending modes) for a range of propeller blade designs and materials.
	•	Validating aerodynamic force estimates for candidate blade geometries against published wind-tunnel data.
	•	Forced vibration response amplitude curves showing how resonance severity varies with RPM and design parameters.
	•	A quantified frequency/resonance margin for each design, identifying which combinations of geometry and operating speed carry higher vibration risk.
	•	A trained machine learning surrogate model capable of predicting forced vibration response directly from design parameters, with reported accuracy and demonstrated speed-up over full simulation.
	•	Identification of the design parameters most strongly influencing vibration/resonance risk (feature importance analysis).
	•	A documented, reproducible, open-source computational pipeline suitable for future extension (e.g., additional fault modes, higher-fidelity aerodynamics).
Planned Demonstration
As this is a fully computational project, the working demonstration (per Section 2 of the course guidelines) will consist of: a live walkthrough of the OpenVSP/VSPAERO simulation for a sample blade design, the Python-based natural frequency and forced-response calculation, a plot of vibration amplitude versus RPM showing the resonance region, and a live prediction from the trained machine learning surrogate model compared against the full simulation result for a held-out test case. This will clearly illustrate the principles of natural frequency, forced vibration, resonance, and damping as applied to a real engineering design problem.
Indicative Timeline
Milestone
Activity
By 31 Aug 2026
Project proposal submission (this document)
Weeks 1–2
Literature review; structural (beam vibration) model built and validated in Python
Weeks 2–3
OpenVSP/VSPAERO setup; propeller geometry and aerodynamic simulation workflow established
Week 4
Validation against UIUC Propeller Database and internal convergence checks
Last week of Sept
Progress review - validated pipeline and preliminary dataset
Weeks 5–6
Full dataset generation; ML surrogate model training and benchmarking
Weeks 7–8
Results analysis, report writing, and preparation of final demonstration
End of semester
Final submission and demonstration