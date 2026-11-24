import json, os, math, sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.linalg import eigh
from scipy.spatial.distance import cdist
from sklearn.covariance import LedoitWolf
from sklearn.neighbors import NearestNeighbors
import http.server, socketserver, urllib.parse, mimetypes

ROOT = Path(__file__).resolve().parent
PARENT = ROOT.parent
DATA = ROOT / "data"

# ---------- materials ----------
MATERIALS = {
    "GF_Nylon": dict(E=9.0e9, RHO=1370.0, ZETA=0.02, label="PA66-GF30 (dataset material)"),
    "Al_6061":  dict(E=69.0e9, RHO=2700.0, ZETA=0.01, label="Al 6061-T6 (illustrative)"),
    "CFRP_QI":  dict(E=70.0e9, RHO=1600.0, ZETA=0.01, label="quasi-isotropic CFRP (illustrative)"),
    "PLA":      dict(E=3.5e9, RHO=1240.0, ZETA=0.03, label="PLA (illustrative)"),
}
RHO_AIR = 1.225
EPS_DEFAULT = 0.10
CH = [f"Chord{i}" for i in range(1, 6)]
TW = [f"Twist{i}" for i in range(1, 6)]
RAW_INPUTS = ["RPM", "FreestreamVelocity", "Blades", "Diameter", "Tilt"] + CH + TW + ["SweepAngle", "AirfoilThickness"]

model = json.load(open(DATA / "model_v2.json"))

# ---------- FE beam ----------
HUB = 0.2
NEL = 30
def fe_cantilever(L, A, I, E, RHO):
    nel = len(A)
    h = L / nel
    n = 2 * (nel + 1)
    K = np.zeros((n, n)); M = np.zeros((n, n))
    for e in range(nel):
        ke = E * I[e] / h**3 * np.array([[12,6*h,-12,6*h],[6*h,4*h*h,-6*h,2*h*h],[-12,-6*h,12,-6*h],[6*h,2*h*h,-6*h,4*h*h]])
        me = RHO * A[e] * h / 420 * np.array([[156,22*h,54,-13*h],[22*h,4*h*h,13*h,-3*h*h],[54,13*h,156,-22*h],[-13*h,-3*h*h,-22*h,4*h*h]])
        idx = slice(2*e, 2*e+4)
        K[idx,idx]+=ke; M[idx,idx]+=me
    K=K[2:,2:]; M=M[2:,2:]
    w2 = eigh(K, M, eigvals_only=True, subset_by_index=[0,0])[0]
    f=np.zeros(K.shape[0]); f[-2]=1.0
    k_tip = 1.0/np.linalg.solve(K, f)[-2]
    return np.sqrt(w2)/(2*np.pi), k_tip

def blade_fn_and_k(R, chords, tc, mat):
    L = R*(1.0-HUB)
    stations = np.linspace(0.0, L, 5)
    chord_stations = np.asarray(chords, dtype=float)*R
    x_elem = (np.arange(NEL)+0.5)*L/NEL
    c = np.interp(x_elem, stations, chord_stations)
    t = tc*c
    A = np.pi*c*t/4.0
    I = np.pi*c*t**3/64.0
    return fe_cantilever(L, A, I, mat["E"], mat["RHO"])

ST_C = np.array([0.2,0.4,0.6,0.8,1.0])
ST_T = np.array([0.2,0.4,0.6,0.75,1.0])

def bet_ct(row, n_int=80, clmax=1.4, kind="sin"):
    R = row["Diameter"]/2.0
    n = row["RPM"]/60.0
    J = row["FreestreamVelocity"]/(n*row["Diameter"])
    tilt = np.deg2rad(row["Tilt"])
    Jax = J*np.cos(tilt)
    x = np.linspace(0.2,1.0,n_int)
    c = np.interp(x, ST_C, [row[f"Chord{i}"] for i in range(1,6)])
    th = np.interp(x, ST_T, np.deg2rad([row[f"Twist{i}"] for i in range(1,6)]))
    phi = np.arctan2(Jax, np.pi*x)
    alpha = th - phi
    if kind=="sin":
        cl = np.clip(2*np.pi*np.sin(alpha), -clmax, clmax)
    else:
        cl = np.clip(2*np.pi*alpha, -clmax, clmax)
    integrand = (c/R)*(x*x+(Jax/np.pi)**2)*cl*np.cos(phi)
    return float(np.pi**2*row["Blades"]/4.0*np.trapezoid(integrand, x))

def weighted_shape(row):
    x = np.linspace(0.2,1.0,200)
    c = np.interp(x, ST_C, [row[f"Chord{i}"] for i in range(1,6)])
    th = np.interp(x, ST_T, [row[f"Twist{i}"] for i in range(1,6)])
    w = x**2
    return float(np.trapezoid(w*c,x)/np.trapezoid(w,x)), float(np.trapezoid(w*th,x)/np.trapezoid(w,x))

def engineer(row):
    # returns dict of features
    n = row["RPM"]/60.0
    B = row["Blades"]
    ch = np.array([row[f"Chord{i}"] for i in range(1,6)], dtype=float)
    tw = np.array([row[f"Twist{i}"] for i in range(1,6)], dtype=float)
    D = row["Diameter"]
    J = row["FreestreamVelocity"]/(n*D)
    tilt = row["Tilt"]
    Jax = J*np.cos(np.deg2rad(tilt))
    Jtan = J*np.sin(np.deg2rad(tilt))
    tip_mach = np.pi*n*D/343.0
    c_mean = ch.mean()
    cw, tww = weighted_shape(row)
    ct_bet = bet_ct(row)
    phi75 = np.arctan2(Jax, 0.75*np.pi)
    alpha75 = np.deg2rad(row["Twist4"]) - phi75
    feats = {
        "B": B, "logD": math.log(D), "tilt": tilt,
        "J_ax": Jax, "J_tan": Jtan, "tip_mach": tip_mach,
        "c_mean": c_mean, "solidity": B*c_mean/np.pi,
        "tw_mean": tw.mean(), "tw75": tw[3], "sweep": row["SweepAngle"],
        "logt": math.log(row["AirfoilThickness"]),
        "c_T_weighted": cw, "solidity_T": B*cw/np.pi,
        "CT_BET": ct_bet, "alpha75": alpha75,
    }
    return feats, ct_bet

def predict_ct(feats):
    fs = model["feature_sets"]
    hc = model["huber_components"]
    preds = []
    for name in model["final_components"]:
        fset = fs[name]
        comp = hc[name]
        x = np.array([feats[f] for f in fset], dtype=float)
        mean = np.array(comp["mean"]); scale = np.array(comp["scale"])
        coef = np.array(comp["coef"])
        xs = (x-mean)/scale
        pred = float(xs @ coef + comp["intercept"])
        preds.append(pred)
    return float(np.mean(preds)), preds

def magnification(r, zeta):
    return 1.0/np.sqrt((1-r*r)**2 + (2*zeta*r)**2)

def amplitude(ct, row, fn, k, material, zeta, eps):
    n = row["RPM"]/60.0
    D = row["Diameter"]
    B = row["Blades"]
    r = n/fn
    mf = magnification(r, zeta)
    return 1e3*(eps*abs(ct)*RHO_AIR*n*n*D**4/B)/k*mf

# ---------- domain check ----------
# training raw inputs from screened dataset
def load_training():
    try:
        df = pd.read_excel(PARENT / "Dataset_screened.xlsx") if (PARENT/"Dataset_screened.xlsx").exists() else pd.read_excel(PARENT/"Dataset.xlsx")
    except Exception:
        df = pd.read_excel(DATA/"Dataset_screened.xlsx") if (DATA/"Dataset_screened.xlsx").exists() else pd.read_excel(DATA/"Dataset.xlsx")
    # keep the same 133 rows the model was trained on
    if "screen_status" in df.columns:
        df = df[df.screen_status.isin(["ok", "watch"])].reset_index(drop=True)
    # screen if needed
    if "CT" not in df.columns:
        n = df.RPM/60.0
        CT = df["Force [N]"]/(RHO_AIR*n*n*df.Diameter**4)
        # apply simple screen
        CP = df["Power [W]"]/(RHO_AIR*n**3*df.Diameter**5)
        hard = (CT.abs()>5)|(CP>5)|(df["Force [N]"].abs()>=5e9)
        suspect = ((df["Force [N]"]>0)&(df["Power [W]"]<0)) | ((df["Power [W]"]<0)&(df["Power [W]"].abs()>1.5*(df["Force [N]"].abs()*df.FreestreamVelocity*np.cos(np.deg2rad(df.Tilt))).replace(0,np.nan))) | ((df["Power [W]"]>0)&(df["Force [N]"]>0)&(df["Force [N]"]*df.FreestreamVelocity*np.cos(np.deg2rad(df.Tilt))/df["Power [W]"]>1))
        keep = ~(hard | (suspect & ~hard))
        df = df[keep].reset_index(drop=True)
    Xtr = df[RAW_INPUTS].values.astype(float)
    mean = Xtr.mean(0); std = Xtr.std(0, ddof=0); std[std==0]=1
    Xs = (Xtr-mean)/std
    lw = LedoitWolf().fit(Xs)
    cov = lw.covariance_
    inv = np.linalg.inv(cov)
    # mahalanobis for training
    d2 = np.array([ (x-mean)@inv@(x-mean)/len(mean) for x in Xtr ])  # actually squared
    # proper squared mahalanobis
    d2 = np.array([ (xs)@inv@(xs) for xs in Xs ])
    thr_maha = 33.41
    # kNN
    nn = NearestNeighbors(n_neighbors=6).fit(Xs)
    dists,_ = nn.kneighbors(Xs)
    knn_d = dists[:,1:].mean(1)  # exclude self? n_neighbors includes self first
    # recompute with 5 neighbors excluding self
    nn5 = NearestNeighbors(n_neighbors=5).fit(Xs)
    dists5,_ = nn5.kneighbors(Xs)
    knn_train = dists5[:,-1]         # distance to the 5th nearest neighbour
    thr_knn = float(np.quantile(knn_train,0.95))
    return mean,std,inv,thr_maha,thr_knn,nn5,Xs

MEAN,STD,INV,THR_MAHA,THR_KNN,NN5,XS_TRAIN = load_training()

def domain_check(row_dict):
    x = np.array([row_dict[f] for f in RAW_INPUTS], dtype=float)
    xs = (x-MEAN)/STD
    d2 = float(xs @ INV @ xs)
    # kNN distance to training
    dists,_ = NN5.kneighbors(xs.reshape(1,-1))
    knn_d = float(dists[0,-1])
    return {
        "mahalanobis_d2": d2,
        "mahalanobis_threshold": THR_MAHA,
        "mahalanobis_flag": bool(d2 > THR_MAHA),
        "knn_distance": knn_d,
        "knn_threshold": THR_KNN,
        "knn_flag": bool(knn_d > THR_KNN),
    }

# ---------- HTTP server ----------
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/" or path == "/index.html":
            self.serve_file(ROOT/"static"/"index.html")
        elif path.startswith("/static/"):
            self.serve_file(ROOT/path.lstrip("/"))
        elif path.startswith("/data/"):
            self.serve_file(ROOT/path.lstrip("/"))
        elif path == "/api/materials":
            self.json(MATERIALS)
        elif path == "/api/metrics":
            m = model["metrics"]
            self.json(m)
        elif path == "/api/cv_results":
            self.csv_json(DATA/"cv_results_v2.csv")
        elif path == "/api/test_predictions":
            self.csv_json(DATA/"test_predictions_v2.csv")
        elif path == "/api/summary":
            self.csv_json(DATA/"summary_v2.csv")
        elif path == "/api/material_envelope":
            self.csv_json(DATA/"material_envelope_v2.csv")
        elif path == "/api/sample":
            # return a random training row
            df = pd.read_excel(PARENT/"Dataset.xlsx") if (PARENT/"Dataset.xlsx").exists() else pd.read_excel(DATA/"Dataset.xlsx")
            r = df.sample(1).iloc[0]
            out = {c: (float(r[c]) if pd.notna(r[c]) else None) for c in df.columns}
            self.json(out)
        elif path == "/api/conformal":
            self.json(model["conformal"])
        else:
            self.send_error(404)
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length",0))
        body = self.rfile.read(length) if length else b"{}"
        if parsed.path in ("/api/predict", "/api/sweep"):
            try:
                payload = json.loads(body)
            except Exception as e:
                self.send_error(400, str(e)); return
            try:
                if parsed.path == "/api/predict":
                    res = self.predict(payload)
                else:
                    res = self.sweep(payload)
                self.json(res)
            except Exception as e:
                import traceback; traceback.print_exc()
                self.send_error(500, str(e))
        else:
            self.send_error(404)
    def sweep(self, payload):
        row = {f: float(payload[f]) for f in RAW_INPUTS}
        material = payload.get("material","GF_Nylon")
        mat = MATERIALS[material]
        zeta = float(payload.get("zeta", mat["ZETA"]))
        eps = float(payload.get("eps", EPS_DEFAULT))
        fn, k = blade_fn_and_k(row["Diameter"]/2.0, [row[f"Chord{i}"] for i in range(1,6)], row["AirfoilThickness"], mat)
        rpm0 = row["RPM"]
        rpms = np.linspace(max(100.0, rpm0*0.35), rpm0*2.2, 160)
        out = {"rpm": [], "ct": [], "amp": [], "r": [], "mf": [], "design_rpm": rpm0, "fn": float(fn)}
        for rpm in rpms:
            rr = dict(row); rr["RPM"] = float(rpm)
            feats, _ = engineer(rr)
            ct, _ = predict_ct(feats)
            n = rpm/60.0
            ratio = n/fn
            mf = magnification(ratio, zeta)
            amp = amplitude(ct, rr, fn, k, mat, zeta, eps)
            out["rpm"].append(float(rpm))
            out["ct"].append(float(ct))
            out["amp"].append(float(amp))
            out["r"].append(float(ratio))
            out["mf"].append(float(mf))
        out["resonance_rpm"] = float(60.0*fn)
        return out
    def predict(self, payload):
        # extract row fields
        row = {}
        for f in RAW_INPUTS:
            row[f] = float(payload[f])
        material = payload.get("material","GF_Nylon")
        mat = MATERIALS[material]
        zeta = float(payload.get("zeta", mat["ZETA"]))
        eps = float(payload.get("eps", EPS_DEFAULT))
        feats, ct_bet = engineer(row)
        ct_hat, comps = predict_ct(feats)
        # FE
        fn, k = blade_fn_and_k(row["Diameter"]/2.0, [row[f"Chord{i}"] for i in range(1,6)], row["AirfoilThickness"], mat)
        n = row["RPM"]/60.0
        r = n/fn
        mf = magnification(r, zeta)
        amp = amplitude(ct_hat, row, fn, k, mat, zeta, eps)
        # conformal CT interval
        conf = model["conformal"]
        q90 = conf["q90"]; sc = conf["scale_c"]
        s = abs(ct_hat)+sc
        half = q90*s
        ct_lo = ct_hat - half
        ct_hi = ct_hat + half
        # amplitude interval
        def amp_of(ctv):
            return amplitude(ctv, row, fn, k, mat, zeta, eps)
        # non-crossing: if interval crosses zero, lower=0
        if ct_lo <= 0 <= ct_hi:
            amp_lo = 0.0
        else:
            amp_lo = min(amp_of(ct_lo), amp_of(ct_hi))
        amp_hi = max(amp_of(ct_lo), amp_of(ct_hi))
        dom = domain_check(row)
        # blade geometry samples for plotting
        R = row["Diameter"]/2.0
        L = R*(1-0.2)
        stations = np.linspace(0.0, L, 5)
        chord_st = np.array([row[f"Chord{i}"] for i in range(1,6)])*R
        twist_st = np.array([row[f"Twist{i}"] for i in range(1,6)])
        x_elem = (np.arange(NEL)+0.5)*L/NEL
        c_elem = np.interp(x_elem, stations, chord_st)
        t_elem = row["AirfoilThickness"]*c_elem
        # geometry points
        geom = {
            "R": float(R), "L": float(L),
            "blades": int(row["Blades"]),
            "sweep": float(row["SweepAngle"]),
            "station_r": [float(0.2 + (i/4)*0.8) for i in range(5)],
            "chord": [float(v) for v in chord_st],
            "twist": [float(v) for v in twist_st],
            "elem_x": [float(v) for v in x_elem],
            "elem_c": [float(v) for v in c_elem],
            "elem_t": [float(v) for v in t_elem],
        }
        return {
            "inputs": row,
            "material": material,
            "zeta": zeta,
            "eps": eps,
            "CT_BET": ct_bet,
            "CT_hat": ct_hat,
            "CT_components": {"b13": comps[0], "b13w": comps[1]},
            "CT_interval": [ct_lo, ct_hi],
            "fn_Hz": float(fn),
            "k_tip": float(k),
            "r_ratio": float(r),
            "magnification": float(mf),
            "amplitude_mm": float(amp),
            "amplitude_interval_mm": [float(amp_lo), float(amp_hi)],
            "domain": dom,
            "geometry": geom,
        }
    def serve_file(self, p):
        p = Path(p)
        if not p.exists():
            self.send_error(404); return
        data = p.read_bytes()
        ct = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def json(self, obj):
        data = json.dumps(obj, default=lambda o: (o.tolist() if hasattr(o,'tolist') else str(o))).encode()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def csv_json(self, p):
        df = pd.read_csv(p)
        self.json({"columns": list(df.columns), "rows": df.to_dict(orient="records")})
    def log_message(self, *a):
        pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT","8000"))
    with socketserver.TCPServer(("",port), Handler) as httpd:
        print(f"Serving on http://localhost:{port}")
        httpd.serve_forever()
