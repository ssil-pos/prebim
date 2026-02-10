from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional

from Pynite import FEModel3D

import numpy as np
import warnings
from scipy.sparse.linalg import MatrixRankWarning


app = FastAPI(title="prebim-analysis-api", version="0.1.0")


class Units(BaseModel):
    length: Literal["m"] = "m"
    force: Literal["kN"] = "kN"


class NodeIn(BaseModel):
    id: str
    x: float
    y: float
    z: float


class Releases(BaseModel):
    Rxi: bool = False
    Ryi: bool = False
    Rzi: bool = False
    Rxj: bool = False
    Ryj: bool = False
    Rzj: bool = False


class MemberIn(BaseModel):
    id: str
    i: str
    j: str
    type: Literal["frame", "truss"]
    E: float
    G: float
    A: float
    Iy: float
    Iz: float
    J: float
    releases: Optional[Releases] = None


class Fixity(BaseModel):
    DX: bool = False
    DY: bool = False
    DZ: bool = False
    RX: bool = False
    RY: bool = False
    RZ: bool = False


class SupportIn(BaseModel):
    nodeId: str
    fix: Fixity


class MemberUDLIn(BaseModel):
    memberId: str
    dir: Literal["GX", "GY", "GZ"]
    w: float  # kN/m (signed)


class LoadCaseIn(BaseModel):
    name: str
    selfweightY: float = 0.0
    memberUDL: List[MemberUDLIn] = Field(default_factory=list)


class LoadComboIn(BaseModel):
    name: str
    factors: Dict[str, float] = Field(default_factory=dict)  # caseName -> factor


class AnalyzeRequest(BaseModel):
    units: Units = Units()
    nodes: List[NodeIn]
    members: List[MemberIn]
    supports: List[SupportIn] = Field(default_factory=list)
    cases: List[LoadCaseIn] = Field(default_factory=list)
    combos: List[LoadComboIn] = Field(default_factory=list)


class NodeDispOut(BaseModel):
    dx: float = 0.0
    dy: float = 0.0
    dz: float = 0.0


class MaxDispOut(BaseModel):
    nodeId: str = ''
    value: float = 0.0


class MemberEndForcesOut(BaseModel):
    Fx: float = 0.0
    Fy: float = 0.0
    Fz: float = 0.0
    Mx: float = 0.0
    My: float = 0.0
    Mz: float = 0.0


class MemberMaxOut(BaseModel):
    N: float = 0.0
    Vy: float = 0.0
    Vz: float = 0.0
    T: float = 0.0
    My: float = 0.0
    Mz: float = 0.0


class MemberResultOut(BaseModel):
    id: str
    i: MemberEndForcesOut
    j: MemberEndForcesOut
    maxAbs: MemberMaxOut
    dyMin: float = 0.0
    dyMax: float = 0.0
    dyAbsMax: float = 0.0


class AnalyzeResponse(BaseModel):
    ok: bool
    combo: str = ''
    nodes: Dict[str, NodeDispOut]
    maxDisp: MaxDispOut
    members: Dict[str, MemberResultOut] = Field(default_factory=dict)
    note: str = ''


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    # Defaults
    if not req.cases:
        req.cases = [LoadCaseIn(name='D', selfweightY=-1.0, memberUDL=[])]
    if not req.combos:
        req.combos = [LoadComboIn(name='LC1', factors={req.cases[0].name: 1.0})]

    COMBO = req.combos[0].name

    def solve(with_fixed_base_rotations: bool, stabilize: bool):
        model = FEModel3D()

        for n in req.nodes:
            model.add_node(n.id, n.x, n.y, n.z)

        # supports
        for s in req.supports:
            f = s.fix
            rx = True if with_fixed_base_rotations else f.RX
            ry = True if with_fixed_base_rotations else f.RY
            rz = True if with_fixed_base_rotations else f.RZ
            model.def_support(
                s.nodeId,
                support_DX=f.DX,
                support_DY=f.DY,
                support_DZ=f.DZ,
                support_RX=rx,
                support_RY=ry,
                support_RZ=rz,
            )

        # members
        for mem in req.members:
            mat_name = f"mat_{mem.id}"
            sec_name = f"sec_{mem.id}"
            model.add_material(mat_name, E=mem.E, G=mem.G, nu=0.3, rho=76.8)
            model.add_section(sec_name, A=mem.A, Iy=mem.Iy, Iz=mem.Iz, J=mem.J)
            model.add_member(mem.id, mem.i, mem.j, mat_name, sec_name)
            if mem.type == "truss":
                # axial-only
                model.def_releases(mem.id, Rxi=True, Ryi=True, Rzi=True, Rxj=True, Ryj=True, Rzj=True)
            elif mem.releases is not None:
                r = mem.releases
                model.def_releases(mem.id, Rxi=r.Rxi, Ryi=r.Ryi, Rzi=r.Rzi, Rxj=r.Rxj, Ryj=r.Ryj, Rzj=r.Rzj)

        # Stabilization springs (MVP)
        if stabilize:
            # slightly stronger stabilization to survive mechanisms from end releases
            k_lin = 10.0  # kN/m
            k_rot = 10.0  # kN*m/rad
            for n in req.nodes:
                model.def_support_spring(n.id, 'DX', k_lin)
                model.def_support_spring(n.id, 'DY', k_lin)
                model.def_support_spring(n.id, 'DZ', k_lin)
                model.def_support_spring(n.id, 'RX', k_rot)
                model.def_support_spring(n.id, 'RY', k_rot)
                model.def_support_spring(n.id, 'RZ', k_rot)

        dir_map = {"GX": "FX", "GY": "FY", "GZ": "FZ"}

        # load cases
        for case in req.cases:
            CASE = case.name
            try:
                if case.selfweightY and abs(case.selfweightY) > 1e-12:
                    model.add_member_self_weight('FY', factor=case.selfweightY, case=CASE)
            except Exception:
                pass

            for udl in case.memberUDL:
                direction = dir_map[udl.dir]
                model.add_member_dist_load(udl.memberId, direction=direction, w1=udl.w, w2=udl.w, case=CASE)

        # combos
        for combo in req.combos:
            model.add_load_combo(combo.name, combo.factors)

        with warnings.catch_warnings():
            if stabilize:
                warnings.filterwarnings('ignore', category=MatrixRankWarning)
            else:
                warnings.filterwarnings('error', category=MatrixRankWarning)
            model.analyze()

        # node displacements
        out_nodes: Dict[str, NodeDispOut] = {}
        max_mag = 0.0
        max_node = None
        for n in req.nodes:
            node = model.nodes[n.id]
            dx = float(node.DX.get(COMBO, 0.0))
            dy = float(node.DY.get(COMBO, 0.0))
            dz = float(node.DZ.get(COMBO, 0.0))
            out_nodes[n.id] = NodeDispOut(dx=dx, dy=dy, dz=dz)
            mag = (dx * dx + dy * dy + dz * dz) ** 0.5
            if mag > max_mag:
                max_mag = mag
                max_node = n.id

        # member end forces + sampled maxima
        out_members: Dict[str, MemberResultOut] = {}
        for mem_in in req.members:
            mem = model.members[mem_in.id]
            # local end forces vector (12 x 1)
            f = np.array(mem.F(COMBO)).reshape(-1)
            # [Fx_i, Fy_i, Fz_i, Mx_i, My_i, Mz_i, Fx_j, Fy_j, Fz_j, Mx_j, My_j, Mz_j]
            i_end = MemberEndForcesOut(Fx=float(f[0]), Fy=float(f[1]), Fz=float(f[2]), Mx=float(f[3]), My=float(f[4]), Mz=float(f[5]))
            j_end = MemberEndForcesOut(Fx=float(f[6]), Fy=float(f[7]), Fz=float(f[8]), Mx=float(f[9]), My=float(f[10]), Mz=float(f[11]))

            # sample along member for max abs results
            try:
                L = float(mem.L())
            except Exception:
                L = 0.0
            Nmax = Vymax = Vzmax = Tmax = Mymax = Mzmax = 0.0
            if L > 1e-9:
                for k in range(0, 21):
                    x = L * k / 20.0
                    try:
                        N = float(mem.axial(x, COMBO))
                        Vy = float(mem.shear('Fy', x, COMBO))
                        Vz = float(mem.shear('Fz', x, COMBO))
                        T = float(mem.torque(x, COMBO))
                        My = float(mem.moment('My', x, COMBO))
                        Mz = float(mem.moment('Mz', x, COMBO))
                        Nmax = max(Nmax, abs(N))
                        Vymax = max(Vymax, abs(Vy))
                        Vzmax = max(Vzmax, abs(Vz))
                        Tmax = max(Tmax, abs(T))
                        Mymax = max(Mymax, abs(My))
                        Mzmax = max(Mzmax, abs(Mz))
                    except Exception:
                        continue

            # deflection extremes (global dy)
            dy_min = 0.0
            dy_max = 0.0
            dy_abs = 0.0
            try:
                dy_min = float(mem.min_deflection('dy', COMBO))
                dy_max = float(mem.max_deflection('dy', COMBO))
                dy_abs = max(abs(dy_min), abs(dy_max))
            except Exception:
                pass

            out_members[mem_in.id] = MemberResultOut(
                id=mem_in.id,
                i=i_end,
                j=j_end,
                maxAbs=MemberMaxOut(N=Nmax, Vy=Vymax, Vz=Vzmax, T=Tmax, My=Mymax, Mz=Mzmax),
                dyMin=dy_min,
                dyMax=dy_max,
                dyAbsMax=dy_abs,
            )

        return AnalyzeResponse(ok=True, combo=COMBO, nodes=out_nodes, maxDisp=MaxDispOut(nodeId=max_node or '', value=max_mag), members=out_members)

    try:
        return solve(with_fixed_base_rotations=False, stabilize=False)
    except (np.linalg.LinAlgError, MatrixRankWarning):
        try:
            return solve(with_fixed_base_rotations=True, stabilize=False)
        except Exception:
            try:
                r = solve(with_fixed_base_rotations=True, stabilize=True)
                r.note = (r.note or '') + ' (stabilized with weak springs)'
                return r
            except Exception as e2:
                return AnalyzeResponse(ok=False, combo=COMBO, nodes={}, maxDisp=MaxDispOut(), members={}, note=f'analysis failed (singular): {e2}')
    except Exception as e:
        msg = str(e)
        if 'singular' in msg.lower() or 'unstable' in msg.lower():
            try:
                return solve(with_fixed_base_rotations=True, stabilize=True)
            except Exception as e2:
                return AnalyzeResponse(ok=False, combo=COMBO, nodes={}, maxDisp=MaxDispOut(), members={}, note=f'analysis failed (singular): {e2}')
        return AnalyzeResponse(ok=False, combo=COMBO, nodes={}, maxDisp=MaxDispOut(), members={}, note=f'analysis failed: {e}')
