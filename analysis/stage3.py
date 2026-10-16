"""Disk Accretion — Stage 3 analysis and the Stage 5 dt-convergence check. Reads the run packets that sweep.mjs writes to
analysis/runs/<batch>/*.json (the same packets are in MongoDB, collections batch_001..011)
and writes the figures to analysis/figures/ and the tables to analysis/tables.md.

    python analysis/stage3.py

Every figure and table is regenerated from the packets; FINDINGS.md says which claim each
one supports.
"""
import glob
import json
import math
import os
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RUNS = os.path.join(HERE, "runs")
FIG = os.path.join(HERE, "figures")
os.makedirs(FIG, exist_ok=True)
K_RADIUS = 2.95e-3          # must match src/world.js
M_EARTH = 3.003e-6
TABLES = []


def load(batch):
    out = []
    for f in sorted(glob.glob(os.path.join(RUNS, batch, "*.json"))):
        with open(f) as fh:
            out.append(json.load(fh))
    return out


def P(run):
    return run["_parameters"]


def radius(run, k):
    """Body radius for a body of k initial masses, as world.radiusOf computes it."""
    p = P(run)
    m0 = run["m0"]
    m = k * m0
    q = p.get("inflationRamp", 0) or 0
    f = 1 + (p["radiusInflation"] - 1) * (m0 / m) ** q if q > 0 else p["radiusInflation"]
    return f * K_RADIUS * m ** (1 / 3)


def safronov(run, k, a):
    """Θ = v_esc² / (2 v_K²) = (m / R) a  (G = M_star = 1)."""
    m = k * run["m0"]
    return m * a / radius(run, k)


def spacing(run, bodies, kmin_frac=0.05, kmin_abs=30):
    """Adjacent spacing Δa / R_H,mutual for the big bodies (k ≥ max(kmin_abs, frac·kmax)),
    R_H,mutual = ((m1 + m2) / 3)^(1/3) (a1 + a2) / 2. Bound orbits inside 5 only."""
    if not bodies:
        return []
    kmax = max(b[0] for b in bodies)
    big = sorted([b for b in bodies if b[0] >= max(kmin_abs, kmin_frac * kmax) and 0 < b[1] < 5],
                 key=lambda b: b[1])
    m0 = run["m0"]
    out = []
    for b1, b2 in zip(big, big[1:]):
        rh = (((b1[0] + b2[0]) * m0) / 3) ** (1 / 3) * 0.5 * (b1[1] + b2[1])
        out.append((b2[1] - b1[1]) / rh)
    return out


def first_time(samples, pred):
    for s in samples:
        if pred(s):
            return s["orbit"]
    return None


SPACING_TIMES = (10, 30, 100, 300, 1000, 3000)


def spacing_at(run, t):
    """(spacings, eccentricities) of the big bodies at the sample nearest orbit t, from the
    per-sample (k, a, e) list; ([], []) if the run has no such sample."""
    ss = [s for s in run["samples"] if "big" in s]
    if not ss:
        return [], []
    s = min(ss, key=lambda s: abs(s["orbit"] - t))
    if abs(s["orbit"] - t) > max(1.0, 0.05 * t):
        return [], []
    bodies = s["big"]
    if not bodies:
        return [], []
    kmax = max(b[0] for b in bodies)
    big = [b for b in bodies if b[0] >= max(30, 0.05 * kmax)]
    return spacing(run, bodies), [b[2] for b in big]


def load_pref(*batches):
    """The first batch that has runs (pass-2 batches supersede pass 1)."""
    for b in batches:
        runs = load(b)
        if runs:
            return runs
    return []


def table(title, header, rows):
    lines = ["### " + title, "", "| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    for r in rows:
        lines.append("| " + " | ".join(str(c) for c in r) + " |")
    TABLES.append("\n".join(lines) + "\n")


def fmt(v, d=2):
    if v is None:
        return "—"
    if isinstance(v, float):
        if v != 0 and (abs(v) >= 1e4 or abs(v) < 1e-2):
            return f"{v:.1e}"
        return f"{v:.{d}f}"
    return str(v)


# ─── batch_001: the default disk — growth modes and final spacing ──────────────────────
def base():
    runs = load_pref("batch_005", "batch_001")
    if not runs:
        return
    # Fig 1: cumulative mass function N(≥k) at several times, seed 1
    r = runs[0]
    want = [0.3, 1, 3, 10, 30, 100, 300, 1000]
    fig, ax = plt.subplots(figsize=(6.4, 4.6))
    cmap = plt.get_cmap("viridis")
    for j, t in enumerate(want):
        s = min(r["samples"], key=lambda s: abs(s["orbit"] - t))
        ks = sorted(((int(k), c) for k, c in s["spectrum"].items()), reverse=True)
        cum, xs, ys = 0, [], []
        for k, c in ks:
            cum += c
            xs.append(k); ys.append(cum)
        ax.step(xs, ys, where="post", color=cmap(j / (len(want) - 1)), label=f"{s['orbit']:.3g} orbits (N={s['n']})")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("body mass k = m / m₀"); ax.set_ylabel("N(≥ k)")
    ax.set_title("Cumulative mass function, default disk (seed 1)")
    ax.legend(fontsize=7, loc="lower left")
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig1_mass_function.png"), dpi=140); plt.close(fig)

    # Fig 2: growth-mode indicators over time, all seeds
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.2))
    peak_rows = []
    for r in runs:
        ss = r["samples"][1:]
        t = [s["orbit"] for s in ss]
        mean_k = [r["N0"] / s["n"] for s in ss]          # number-mean mass (mass conserved to ~1e-13)
        axs[0].plot(t, [s["maxK"] for s in ss], color="C3", lw=1, alpha=0.8)
        axs[0].plot(t, mean_k, color="C0", lw=1, alpha=0.8)
        rel, field, lead = [], [], []
        for s, mk in zip(ss, mean_k):
            ks = sorted((int(k) for k, c in s["spectrum"].items() for _ in range(c)), reverse=True)
            rel.append(ks[0] / mk)
            field.append(ks[0] / max(1, ks[len(ks) // 2]))
            lead.append(ks[0] / ks[min(9, len(ks) - 1)] if len(ks) > 1 else 1)
        axs[1].plot(t, rel, color="C1", lw=1.2, alpha=0.9)
        axs[1].plot(t, field, color="C2", lw=1, alpha=0.6)
        axs[1].plot(t, lead, color="C4", lw=1, alpha=0.8)
        i = int(np.argmax(rel))
        peak_rows.append([r["run"], fmt(t[i]), fmt(rel[i], 0), ss[i]["n"], ss[i]["maxK"]])
    axs[0].plot([], [], color="C3", label="largest body M₁"); axs[0].plot([], [], color="C0", label="mean body ⟨m⟩")
    axs[0].set_xscale("log"); axs[0].set_yscale("log"); axs[0].set_xlabel("orbits at r = 1"); axs[0].set_ylabel("mass / m₀")
    axs[0].legend(fontsize=8); axs[0].set_title("Largest vs mean mass (4 seeds)")
    axs[1].plot([], [], color="C1", label="M₁ / ⟨m⟩: rises = runaway, falls = oligarchic")
    axs[1].plot([], [], color="C2", label="M₁ / median body (pull from the field)")
    axs[1].plot([], [], color="C4", label="M₁ / M₁₀ (spread among the leaders)")
    axs[1].set_xscale("log"); axs[1].set_yscale("log"); axs[1].set_xlabel("orbits at r = 1")
    axs[1].legend(fontsize=7.5); axs[1].set_title("Growth-mode indicators")
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig2_growth_modes.png"), dpi=140); plt.close(fig)
    table(runs[0]["collection"] + " — end of runaway: peak of M₁/⟨m⟩ (after it, the mean catches up)",
          ["run", "orbit of peak", "peak M₁/⟨m⟩", "N then", "M₁ then (m₀)"], peak_rows)

    # tail slope of the cumulative mass function, N(≥k) ∝ k^-β over 2 ≤ k ≤ k_max/2
    srows = []
    for t_want in (1, 3, 10, 30):
        betas = []
        for r in runs:
            s = min(r["samples"], key=lambda s: abs(s["orbit"] - t_want))
            ks = sorted(((int(k), c) for k, c in s["spectrum"].items()), reverse=True)
            cum, xs, ys = 0, [], []
            for k, c in ks:
                cum += c
                xs.append(k); ys.append(cum)
            kmax = xs[0]
            sel = [(x, y) for x, y in zip(xs, ys) if 2 <= x <= kmax / 2]
            if len(sel) >= 4:
                betas.append(-np.polyfit(np.log([p[0] for p in sel]), np.log([p[1] for p in sel]), 1)[0])
        if betas:
            srows.append([t_want, fmt(float(np.mean(betas))), fmt(float(np.std(betas))), fmt(float(np.mean(betas)) + 1)])
    table(runs[0]["collection"] + f" — power-law tail of the mass function, N(≥k) ∝ k^-β ({len(runs)} seeds); differential index q = β + 1 "
          "(runaway models give q ≈ 2.5)", ["orbits", "β mean", "β sd", "q = β + 1"], srows)

    # Fig 3: spacing in mutual Hill radii over time, from the true (a, e) recorded per sample
    fig, ax = plt.subplots(figsize=(6.8, 4.4))
    bins = np.logspace(-1, 2, 28)
    sp_rows = []
    T = SPACING_TIMES
    for j, t in enumerate(T):
        vals, es = [], []
        for r in runs:
            sp, e = spacing_at(r, t)
            vals += sp; es += e
        if vals:
            ax.hist(vals, bins=bins, histtype="step" if t != T[-1] else "stepfilled", alpha=1 if t != T[-1] else 0.45,
                    lw=1.4, color=plt.get_cmap("viridis")(j / (len(T) - 1)), label=f"{t} orbits ({len(vals)} gaps)")
            sp_rows.append([t, len(vals), fmt(float(np.median(vals))), fmt(float(np.percentile(vals, 25))),
                            fmt(float(np.percentile(vals, 75))), fmt(float(np.median(es)), 3)])
    ax.axvspan(5, 10, color="0.5", alpha=0.2, label="expected 5–10 R_H")
    ax.set_xscale("log"); ax.set_xlabel("Δa / R_H,mutual (big bodies: k ≥ max(30, 5% of k_max))"); ax.set_ylabel("adjacent pairs")
    ax.set_title(f"Spacing of the big bodies, default disk ({len(runs)} seeds)")
    ax.legend(fontsize=7.5)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig3_hill_spacing.png"), dpi=140); plt.close(fig)
    table(f"{runs[0]['collection']} — adjacent spacing of big bodies in mutual Hill radii ({len(runs)} seeds pooled; true a)",
          ["orbits", "gaps", "median", "25%", "75%", "median e"], sp_rows)

    rows = []
    for r in runs:
        f = r["final"]
        sp = spacing(r, f["bodies"])
        big = [b for b in f["bodies"] if b[0] >= 30]
        rows.append([r["run"], fmt(f["orbit"], 0), f["n"], f["maxK"], len(big),
                     fmt(float(np.median(sp)) if sp else None), fmt(min(sp) if sp else None), fmt(max(sp) if sp else None),
                     fmt(float(np.mean([b[2] for b in big])) if big else None, 3),
                     f["nAccreted"], f["nEjected"], fmt(f["LzDrift"])])
    table(runs[0]["collection"] + " — default disk (N = 10k, M = 0.003, inflation 30), final state",
          ["run", "orbits", "N", "max k", "bodies ≥30 m₀", "median Δa/R_H", "min", "max", "mean e (≥30)", "accreted", "ejected", "L_z drift"], rows)


# ─── batch_004: Toomre instability with collisions off ─────────────────────────────────
def clumping(s, nr=10, nphi=48, rin=0.5, rout=2.0):
    """Count variance / mean in polar cells (Poisson = 1), averaged over annuli; a Q < 1 disk
    collapsing into clumps and wakes drives it far above 1."""
    x, y = np.array(s["x"]), np.array(s["y"])
    r, phi = np.hypot(x, y), np.arctan2(y, x)
    ok = (r >= rin) & (r < rout)
    ir = ((r[ok] - rin) / (rout - rin) * nr).astype(int)
    ip = ((phi[ok] + np.pi) / (2 * np.pi) * nphi).astype(int) % nphi
    grid = np.zeros((nr, nphi))
    np.add.at(grid, (ir, ip), 1)
    ratios = [row.var() / row.mean() for row in grid if row.mean() > 0]
    return float(np.mean(ratios)) if ratios else None


def toomre():
    runs = sorted(load("batch_004"), key=lambda r: P(r)["diskMass"])
    if not runs:
        return
    times = [0.25, 0.5, 1, 2, 3]
    fig, axs = plt.subplots(len(runs), len(times), figsize=(2.4 * len(times), 2.4 * len(runs)), squeeze=False)
    rows = []
    for i, r in enumerate(runs):
        row = [fmt(P(r)["diskMass"], 4), fmt(toomre_q(r))]
        for j, t in enumerate(times):
            s = min(r["snaps"], key=lambda s: abs(s["orbit"] - t))
            ax = axs[i][j]
            ax.set_facecolor("#0b0e13"); ax.set_xticks([]); ax.set_yticks([])
            ax.set_xlim(-2.3, 2.3); ax.set_ylim(-2.3, 2.3); ax.set_aspect("equal")
            ax.scatter(s["x"], s["y"], s=0.15, c="#9fc4ff", linewidths=0)
            if i == 0:
                ax.set_title(f"{t} orbits", fontsize=9)
            if j == 0:
                ax.set_ylabel(f"M={P(r)['diskMass']}, Q={toomre_q(r):.2g}", fontsize=8)
        for t in [0] + times:
            s = min(r["snaps"], key=lambda s: abs(s["orbit"] - t))
            row.append(fmt(clumping(s)))
        rows.append(row)
    fig.suptitle("Collisions off: a Q < 1 disk fragments into wakes and clumps; Q ≫ 1 stays smooth", fontsize=10)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig4b_toomre_nocollisions.png"), dpi=130); plt.close(fig)
    table("batch_004 — clumping (count variance / mean in polar cells; Poisson = 1), collisions off, N = 10k",
          ["disk mass", "Q(r=1)"] + [f"{t} orb" for t in [0] + times], rows)


# ─── batch_002: disk-mass sweep ──────────────────────────────────────────────────────
def toomre_q(run):
    """Initial Toomre Q at r = 1: Q = σ_r κ / (3.36 G Σ), κ = Ω = 1, σ_r = dispersion · v_c,
    Σ(1) for Σ ∝ r^-p normalised over [rIn, rOut] (p = 1 → M / (2π (rOut − rIn)))."""
    p = P(run)
    M, rin, rout, slope = p["diskMass"], p["rIn"], p["rOut"], p["sigmaSlope"]
    k = 2 - slope
    norm = (rout ** k - rin ** k) / k if abs(k) > 1e-9 else math.log(rout / rin)
    sigma1 = M / (2 * math.pi * norm)
    return p["dispersion"] / (3.36 * sigma1)


def mass():
    runs = load_pref("batch_006", "batch_002")
    if not runs:
        return
    by = defaultdict(list)
    for r in runs:
        by[P(r)["diskMass"]].append(r)
    rows = []
    for M in sorted(by):
        rs = by[M]
        r0 = rs[0]
        def per(fn):
            v = [fn(r) for r in rs]
            v = [x for x in v if x is not None]
            return float(np.mean(v)) if v else None
        thalf = per(half_time)
        t100 = per(lambda r: first_time(r["samples"], lambda s: s["maxK"] >= 100))
        sp = [x for r in rs for x in spacing(r, r["final"]["bodies"])]
        rows.append([fmt(M, 4), fmt(M / M_EARTH, 0), fmt(toomre_q(r0)), fmt(thalf), fmt(t100),
                     "/".join(fmt(r["final"]["orbit"], 0) + ("*" if r["final"]["capped"] else "") for r in rs),
                     "/".join(str(r["final"]["n"]) for r in rs), "/".join(str(r["final"]["maxK"]) for r in rs),
                     "/".join(str(len([b for b in r["final"]["bodies"] if b[0] >= 30])) for r in rs),
                     fmt(float(np.median(sp)) if sp else None),
                     "/".join(str(r["final"]["nEjected"]) for r in rs), "/".join(str(r["final"]["nAccreted"]) for r in rs)])
    table(runs[0]["collection"] + " — disk-mass sweep (N = 5000, inflation 30, 2 seeds; a/b = seed 1/seed 2; * = wall-capped)",
          ["disk mass", "M⊕", "Q(r=1)", "t(N halves)", "t(max ≥100 m₀)", "orbits run", "final N", "max k", "bodies ≥30 m₀",
           "median Δa/R_H", "ejected", "accreted"], rows)

    # Fig 8: median big-body spacing and eccentricity vs time, per disk mass (pooled seeds)
    if any("big" in s for r in runs for s in r["samples"]):
        fig, axs = plt.subplots(1, 2, figsize=(11, 4.2))
        cmap = plt.get_cmap("plasma")
        Ms = sorted(by)
        ts = [t for t in np.logspace(0.5, math.log10(max(r["final"]["orbit"] for r in runs)), 22)]
        srows = []
        for i, M in enumerate(Ms):
            med, emed, tt = [], [], []
            for t in ts:
                vals, es = [], []
                for r in by[M]:
                    sp, e = spacing_at(r, t)
                    vals += sp; es += e
                if len(vals) >= 2:
                    tt.append(t); med.append(float(np.median(vals))); emed.append(float(np.median(es)))
            col = cmap(i / max(1, len(Ms) - 1))
            axs[0].plot(tt, med, "o-", ms=3, color=col, label=f"M={M} (Q={toomre_q(by[M][0]):.2g})")
            axs[1].plot(tt, emed, "o-", ms=3, color=col)
            row = [fmt(M, 4)]
            for t in (30, 100, 300, 1000, 3000):
                vals, es = [], []
                for r in by[M]:
                    sp, e = spacing_at(r, t)
                    vals += sp; es += e
                row.append((fmt(float(np.median(vals))) + f" (e {float(np.median(es)):.2f}, {len(vals)})") if vals else "—")
            srows.append(row)
        axs[0].axhspan(5, 10, color="0.5", alpha=0.2)
        axs[0].set_xscale("log"); axs[0].set_yscale("log"); axs[0].set_xlabel("orbits at r = 1"); axs[0].set_ylabel("median Δa / R_H,mutual")
        axs[0].set_title("Big-body spacing vs time (band: 5–10 R_H)"); axs[0].legend(fontsize=7)
        axs[1].set_xscale("log"); axs[1].set_yscale("log"); axs[1].set_xlabel("orbits at r = 1"); axs[1].set_ylabel("median e of big bodies")
        axs[1].set_title("Big-body eccentricity vs time")
        fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig8_spacing_vs_time.png"), dpi=140); plt.close(fig)
        table(runs[0]["collection"] + " — median big-body spacing in R_H,mutual vs time (median e, number of gaps; 2 seeds pooled)",
              ["disk mass", "30 orb", "100 orb", "300 orb", "1000 orb", "3000 orb"], srows)

    # Fig 4: early snapshots, light vs heavy disks (seed 1)
    pick = [M for M in sorted(by) if M in (0.003, 0.03, 0.1)]
    times = [0.5, 1, 2, 5]
    fig, axs = plt.subplots(len(pick), len(times), figsize=(2.6 * len(times), 2.6 * len(pick)), squeeze=False)
    for i, M in enumerate(pick):
        r = by[M][0]
        for j, t in enumerate(times):
            ax = axs[i][j]
            s = min(r["snaps"], key=lambda s: abs(s["orbit"] - t)) if r["snaps"] else None
            ax.set_facecolor("#0b0e13"); ax.set_xticks([]); ax.set_yticks([])
            ax.set_xlim(-2.4, 2.4); ax.set_ylim(-2.4, 2.4); ax.set_aspect("equal")
            if s:
                k = np.array(s["k"]); sz = 0.3 + 3 * np.cbrt(k / 10.0)
                ax.scatter(s["x"], s["y"], s=sz, c=np.log10(k), cmap="plasma", vmin=0, vmax=3, linewidths=0)
            if i == 0:
                ax.set_title(f"{t} orbits", fontsize=9)
            if j == 0:
                ax.set_ylabel(f"M={M}, Q={toomre_q(r):.2g}", fontsize=8)
    fig.suptitle("Disk-mass regimes: stable sweeping (top) vs Toomre-unstable clumping (bottom)", fontsize=10)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig4_mass_regimes.png"), dpi=130); plt.close(fig)

    # Fig 5: N(t) for each disk mass
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    cmap = plt.get_cmap("plasma")
    Ms = sorted(by)
    for i, M in enumerate(Ms):
        for r in by[M]:
            ss = r["samples"][1:]
            ax.plot([s["orbit"] for s in ss], [s["n"] for s in ss], color=cmap(i / max(1, len(Ms) - 1)), lw=1,
                    label=f"M={M} (Q={toomre_q(r):.2g})" if r is by[M][0] else None)
    ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlabel("orbits at r = 1"); ax.set_ylabel("bodies left")
    ax.legend(fontsize=7); ax.set_title("Number of bodies vs time across disk mass")
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig5_mass_sweep_N.png"), dpi=140); plt.close(fig)


# ─── batch_003: radius-inflation sweep ─────────────────────────────────────────────────
def inflation():
    runs = load("batch_003") + load("batch_007")      # 007 = seeds 3-4 of the same configs (Stage 5)
    if not runs:
        return
    by = defaultdict(list)
    for r in runs:
        p = P(r)
        by[(p["radiusInflation"], p.get("inflationRamp", 0) or 0)].append(r)
    rows, xs_half, ys_half = [], [], []
    for key in sorted(by, key=lambda k: (k[1], k[0])):
        f0, q = key
        rs = by[key]
        def per(fn):
            v = [fn(r) for r in rs]
            v = [x for x in v if x is not None]
            return float(np.mean(v)) if v else None
        thalf = per(half_time)
        t100 = per(lambda r: first_time(r["samples"], lambda s: s["maxK"] >= 100))
        if q == 0 and thalf is not None:
            xs_half.append(f0); ys_half.append(thalf)
        # Safronov number of the largest body at the end
        th = []
        for r in rs:
            b = r["final"]["bodies"][0]
            if 0 < b[1] < 50:
                th.append(safronov(r, b[0], b[1]))
        unb = "/".join(str(max(s["unbound"] for s in r["samples"])) for r in rs)
        rows.append([fmt(f0, 0) + (f" ramp q={q}" if q else ""),
                     fmt(thalf), fmt(t100),
                     "/".join(fmt(r["final"]["orbit"], 0) + ("*" if r["final"]["capped"] else "") for r in rs),
                     "/".join(str(r["final"]["n"]) for r in rs), "/".join(str(r["final"]["maxK"]) for r in rs),
                     fmt(float(np.mean(th)) if th else None),
                     "/".join(str(r["final"]["nEjected"]) for r in rs), "/".join(str(r["final"]["nAccreted"]) for r in rs), unb,
                     "/".join(fmt(float(np.mean([b[2] for b in r["final"]["bodies"] if b[0] >= 30])) if any(b[0] >= 30 for b in r["final"]["bodies"]) else None, 3) for r in rs)])
    table(f"batch_003 + 007 — radius-inflation sweep (N = 5000, M = 0.003, dt = 0.01, {len(runs) // len(by)} seeds; a/b/… = seed 1/2/…; * = wall-capped)",
          ["inflation", "t(N halves)", "t(max ≥100 m₀)", "orbits run", "final N", "max k", "Θ largest (final)",
           "ejected", "accreted", "max unbound", "mean e (≥30)"], rows)

    # Fig 6: growth time vs inflation (constant-inflation runs)
    if len(xs_half) >= 2:
        fig, ax = plt.subplots(figsize=(5.6, 4.2))
        ax.loglog(xs_half, ys_half, "o-", color="C0", label="t (N halves)")
        sl = np.polyfit(np.log(xs_half), np.log(ys_half), 1)[0]
        for ref, lab in ((-1, "∝ f⁻¹ (geometric)"), (-0.5, "∝ f⁻½ (focused, 2D)")):
            xx = np.array([min(xs_half), max(xs_half)])
            ax.loglog(xx, ys_half[-1] * (xx / xs_half[-1]) ** ref, "--", lw=0.8, label=lab)
        ax.set_xlabel("radius inflation f"); ax.set_ylabel("orbits")
        ax.set_title(f"Growth time vs inflation (fitted slope {sl:.2f})")
        ax.legend(fontsize=8)
        fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig6_inflation_growth.png"), dpi=140); plt.close(fig)
        TABLES.append(f"Fitted slope of t(N halves) vs inflation (constant-inflation runs): {sl:.2f}\n")

    # Fig 7: ejected + unbound vs Θ of the largest body over time (all batch_003 runs)
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    for ci, key in enumerate(sorted(by, key=lambda k: (k[1], k[0]))):
        for r in by[key]:
            ss = r["samples"][1:]
            ax.plot([s["orbit"] for s in ss], [s["nEjected"] + s["nAccreted"] for s in ss], lw=1, color=f"C{ci}",
                    ls="-" if key[1] == 0 else "--",
                    label=f"f={key[0]}" + (f" ramp" if key[1] else "") if r is by[key][0] else None)
    ax.set_xscale("log"); ax.set_xlabel("orbits at r = 1"); ax.set_ylabel("bodies ejected + accreted (cumulative)")
    ax.set_title(f"Bodies leaving the disk vs inflation ({len(runs) // len(by)} seeds each; dashed = ramp)")
    ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig7_inflation_removal.png"), dpi=140); plt.close(fig)


# ─── Stage 5: dt-convergence of the Stage 3 headline numbers ───────────────────────────
# The same configs at dt = 0.01 (batch_003 + 007, batch_005), 0.005 (008, 010) and 0.0025
# (009, 011). The dynamics are chaotic, so a smaller dt gives a different realisation, not a
# more precise copy: compare ensembles (mean ± standard error over seeds), not seed by seed.
DT_BATCHES = {
    "inflation": {0.01: ("batch_003", "batch_007"), 0.005: ("batch_008",), 0.0025: ("batch_009",)},
    "base": {0.01: ("batch_005",), 0.005: ("batch_010",), 0.0025: ("batch_011",)},
}
DTS = (0.01, 0.005, 0.0025)


def config_label(run):
    p = P(run)
    if p["N"] == 10000:
        return "default disk (f 30, N 10k, 3000 orb)"
    q = p.get("inflationRamp", 0) or 0
    return f"f {p['radiusInflation']:g}" + (f" fading q={q:g}" if q else "")


def run_metrics(r):
    f = r["final"]
    big = [b for b in f["bodies"] if b[0] >= 30]
    sp = spacing(r, f["bodies"])
    return {
        "ejected": f["nEjected"],
        "accreted": f["nAccreted"],
        "first ejection": first_time(r["samples"], lambda s: s["nEjected"] > 0),
        "final e (≥30 m₀)": float(np.mean([b[2] for b in big])) if big else None,
        "final Δa/R_H": float(np.median(sp)) if sp else None,
        "t(N halves)": half_time(r),
    }


def half_time(r):
    """Orbit at which N falls to N0/2, interpolated in log n vs log t between samples (the
    sample grid is 0.1 dex early, so first_time alone quantises t½ to ~25%)."""
    ss = [s for s in r["samples"] if s["orbit"] > 0]
    for s0, s1 in zip(ss, ss[1:]):
        if s1["n"] <= r["N0"] / 2 < s0["n"]:
            u = (math.log(s0["n"]) - math.log(r["N0"] / 2)) / (math.log(s0["n"]) - math.log(s1["n"]))
            return math.exp(math.log(s0["orbit"]) + u * (math.log(s1["orbit"]) - math.log(s0["orbit"])))
    return None


METRICS = ("ejected", "accreted", "first ejection", "final e (≥30 m₀)", "final Δa/R_H", "t(N halves)")


def mean_se(v):
    v = [x for x in v if x is not None]
    if not v:
        return None, None, 0
    return float(np.mean(v)), (float(np.std(v, ddof=1) / math.sqrt(len(v))) if len(v) > 1 else None), len(v)


def dtconv():
    groups = defaultdict(lambda: defaultdict(list))      # config → dt → [metrics]
    for fam in DT_BATCHES.values():
        for dt, batches in fam.items():
            for b in batches:
                for r in load(b):
                    if abs(P(r)["dt"] - dt) > 1e-12:
                        raise ValueError(f"{r['run']} in {b} has dt {P(r)['dt']}, expected {dt}")
                    groups[config_label(r)][dt].append(run_metrics(r))
    if not any(len(v) > 1 for g in groups.values() for v in g.values()):
        return
    order = sorted(groups, key=lambda c: (c.startswith("default"), "fading" in c, float(c.split()[1]) if not c.startswith("default") else 0))
    rows = []
    stats = {}
    for c in order:
        for m in METRICS:
            cells, ms = [], {}
            for dt in DTS:
                mu, se, n = mean_se([x[m] for x in groups[c].get(dt, [])])
                ms[dt] = (mu, se, n)
                cells.append("—" if mu is None else fmt(mu) + (" ± " + fmt(se) if se is not None else "") + f" ({n})")
            stats[(c, m)] = ms
            (m1, s1, _), (m4, s4, _) = ms[0.01], ms[0.0025]
            if m1 is not None and m4 is not None and s1 is not None and s4 is not None and (s1 or s4):
                z = (m4 - m1) / math.hypot(s1, s4)
                rel = (m4 - m1) / abs(m1) if m1 else None
                verdict = "converged" if abs(z) < 2 else "dt-dependent"
                cells += [fmt(rel * 100, 0) + "%" if rel is not None else "—", fmt(z, 1), verdict]
            else:
                cells += ["—", "—", "—"]
            rows.append([c, m] + cells)
    table("Stage 5 — dt-convergence: mean ± standard error over seeds (number of runs) at dt = 0.01, 0.005, 0.0025; "
          "Δ = (dt/4 − dt) / |dt value|; z = Δmean / combined SE; |z| < 2 → converged within seed scatter. "
          "Inflation sweep: N = 5000, 1000 orbits (dt = 0.01 is batch_003 + 007); default disk: batch_005 / 010 / 011. "
          "First-ejection mean is over runs that ejected.",
          ["config", "quantity", "dt 0.01", "dt 0.005", "dt 0.0025", "Δ (dt/4 vs dt)", "z", "verdict"], rows)

    # the growth-time exponent t½ ∝ f^s at each dt (constant inflation; all f, and f ≥ 3)
    const = [c for c in order if c.startswith("f ") and "fading" not in c]
    line = []
    for dt in DTS:
        pts = [(float(c.split()[1]), stats[(c, "t(N halves)")][dt][0]) for c in const if stats[(c, "t(N halves)")][dt][0]]
        if len(pts) >= 3:
            fs, th = np.log([p[0] for p in pts]), np.log([p[1] for p in pts])
            line.append(f"dt {dt}: {np.polyfit(fs, th, 1)[0]:.2f} (f ≥ 3: {np.polyfit(fs[fs > 0.5], th[fs > 0.5], 1)[0]:.2f})")
    if line:
        TABLES.append("Fitted slope of t(N halves) vs inflation by dt (seed means): " + "; ".join(line) + "\n")

    # Fig 9: each quantity per config, the three dts side by side
    fig, axs = plt.subplots(2, 3, figsize=(14, 7.6))
    cols = {0.01: "C0", 0.005: "C1", 0.0025: "C3"}
    x = np.arange(len(order))
    for ax, m in zip(axs.flat, METRICS):
        for j, dt in enumerate(DTS):
            xs, ys, es = [], [], []
            for i, c in enumerate(order):
                mu, se, n = stats[(c, m)][dt]
                if mu is not None:
                    xs.append(i + (j - 1) * 0.22); ys.append(mu); es.append(se or 0)
            ax.errorbar(xs, ys, yerr=es, fmt="o", ms=4, capsize=2, color=cols[dt], label=f"dt = {dt}")
        short = lambda c: "default\n(N 10k)" if c.startswith("default") else c.replace(" fading q=1", "\nfading")
        ax.set_xticks(x); ax.set_xticklabels([short(c) for c in order], fontsize=7.5)
        ax.set_title(m, fontsize=10)
        if m in ("ejected", "accreted"):
            ax.set_yscale("symlog", linthresh=1); ax.set_ylim(bottom=0)
        elif m in ("first ejection", "t(N halves)"):
            ax.set_yscale("log")
        if m == "final Δa/R_H":
            ax.axhspan(5, 10, color="0.5", alpha=0.2)
    axs[0][0].legend(fontsize=8)
    fig.suptitle("dt-convergence of the Stage 3 numbers (mean ± SE over seeds)", fontsize=11)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig9_dt_convergence.png"), dpi=140); plt.close(fig)


# ─── Stage 5: do the oligarchs crowd, or did the Stage 3 cut count the field? ────────────
# The Stage 3 spacing cut (k ≥ max(30, 5% of k_max)) admits 40–80 bodies at 10–30 orbits:
# the leaders and the mid-mass field between them. Feeding-zone spacing is a claim about the
# leaders, so measure those alone (k ≥ 30% of k_max), and how far their eccentric excursions
# reach (e·a / R_H: above ~1 a neighbour a few R_H away is on a crossing orbit).
def leader_spacing_at(run, t, frac=0.3):
    ss = [s for s in run["samples"] if "big" in s]
    if not ss:
        return [], [], None
    s = min(ss, key=lambda s: abs(s["orbit"] - t))
    if abs(s["orbit"] - t) > max(1.0, 0.2 * t) or not s["big"]:
        return [], [], None
    kmax = max(b[0] for b in s["big"])
    lead = [b for b in s["big"] if b[0] >= max(30, frac * kmax)]
    m0 = run["m0"]
    exc = [b[2] / ((b[0] * m0 / 3) ** (1 / 3)) for b in lead]       # e·a / R_H (a cancels)
    share = sum(b[0] for b in lead) / sum(int(k) * c for k, c in s["spectrum"].items())
    return spacing(run, s["big"], kmin_frac=frac), exc, share


def feeding():
    fams = {c: [] for c in ("default disk (f 30, N 10k, 3000 orb)",)}
    # dt ≤ 0.005 only: the scattering-heavy configs' spacing is not converged at dt = 0.01 (dtconv)
    for b in ("batch_010", "batch_011", "batch_008", "batch_009"):
        for r in load(b):
            fams.setdefault(config_label(r), []).append(r)
    fams = {c: rs for c, rs in fams.items() if rs and any("big" in s for s in rs[0]["samples"])}
    if not fams:
        return
    order = sorted(fams, key=lambda c: (not c.startswith("default"), "fading" in c, float(c.split()[1]) if not c.startswith("default") else 0))
    ts = [float(t) for t in np.logspace(0, 3.4, 30)]
    fig, axs = plt.subplots(1, 2, figsize=(12, 4.4))
    rows = []
    for i, c in enumerate(order):
        rs = fams[c]
        col = "k" if c.startswith("default") else f"C{i}"
        tt, med, tt2, med2 = [], [], [], []
        for t in ts:
            lead = [x for r in rs for x in leader_spacing_at(r, t)[0]]
            if len(lead) >= 3:
                tt.append(t); med.append(float(np.median(lead)))
            if c.startswith("default"):
                cut = [x for r in rs for x in spacing_at(r, t)[0]]
                if len(cut) >= 3:
                    tt2.append(t); med2.append(float(np.median(cut)))
        axs[0 if c.startswith("default") else 1].plot(tt, med, "o", ms=3, color=col, ls="-" if "fading" not in c else "--",
                                                       label=(f"leaders (k ≥ 30% k_max), {len(rs)} runs" if c.startswith("default") else c))
        if tt2:
            axs[0].plot(tt2, med2, "s:", ms=3, color="0.5", label="Stage 3 cut (k ≥ max(30, 5% k_max))")
        thalf = [half_time(r) for r in rs]
        th = float(np.median([x for x in thalf if x is not None]))
        row = [c, len(rs), fmt(th)]
        for mult in (3, 10, 30, 100):
            sp, ex, sh = [], [], []
            for r in rs:
                a, e, f = leader_spacing_at(r, mult * th)
                sp += a; ex += e
                if f is not None:
                    sh.append(f)
            row.append(f"{float(np.median(sp)):.1f} [{float(np.percentile(sp, 25)):.1f}–{float(np.percentile(sp, 75)):.1f}], e·a/R_H {float(np.median(ex)):.1f}, share {float(np.median(sh)):.2f} ({len(sp)})" if len(sp) >= 3 else "—")
        rows.append(row)
    for ax, title in zip(axs, ("Default disk: leaders vs the Stage 3 cut (dt 0.005 + 0.0025)",
                               "Leader spacing vs inflation (N 5000; dashed = fading; dt 0.005 + 0.0025)")):
        ax.axhspan(5, 10, color="0.5", alpha=0.2)
        ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlabel("orbits at r = 1"); ax.set_ylabel("median Δa / R_H,mutual")
        ax.set_title(title, fontsize=10); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig10_leader_spacing.png"), dpi=140); plt.close(fig)
    table("Stage 5 — spacing of the leaders (bound bodies with k ≥ max(30, 30% of k_max)) at multiples of each config's "
          "t(N halves): median Δa/R_H,mutual [IQR], median e·a/R_H of the leaders, median share of the remaining disk mass held by the leaders (gaps). "
          "Feeding-zone spacing would be leaders at ≥ 5 R_H while the share is still small. Seeds and dt = 0.005 + 0.0025 pooled.",
          ["config", "runs", "t(N halves)", "3 t½", "10 t½", "30 t½", "100 t½"], rows)


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")       # the tables use Δ, ½, ≥ (a cp1252 console can't print them)
    base()
    mass()
    toomre()
    inflation()
    dtconv()
    feeding()
    with open(os.path.join(HERE, "tables.md"), "w", encoding="utf-8") as fh:
        fh.write("# Disk Accretion — Stage 3 tables\n\nGenerated by `python analysis/stage3.py` from analysis/runs/ "
                 "(MongoDB batch_001..011). Times are orbits at r = 1.\n\n" + "\n".join(TABLES))
    print("\n".join(TABLES))
