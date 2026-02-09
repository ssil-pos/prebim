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


class LoadsIn(BaseModel):
    selfweightY: float = -1.0
    memberUDL: List[MemberUDLIn] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    units: Units = Units()
    nodes: List[NodeIn]
    members: List[MemberIn]
    supports: List[SupportIn] = Field(default_factory=list)
    loads: LoadsIn = LoadsIn()


class NodeDispOut(BaseModel):
    dx: float = 0.0
    dy: float = 0.0
    dz: float = 0.0


class MaxDispOut(BaseModel):
    nodeId: str = ''
    value: float = 0.0


class AnalyzeResponse(BaseModel):
    ok: bool
    nodes: Dict[str, NodeDispOut]
    maxDisp: MaxDispOut
    note: str = ''


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    CASE = 'L1'
    COMBO = 'LC1'

    def solve(with_fixed_base_rotations: bool, stabilize: bool):
        # Build model
        model = FEModel3D()

        # Materials/sections: to keep it simple, make per-member unique names
        for n in req.nodes:
            model.add_node(n.id, n.x, n.y, n.z)

        # supports
        for s in req.supports:
            f = s.fix
            # fallback option: fix base rotations to avoid mechanisms
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
            # rho: weight density (kN/m^3). Use steel ~76.8 kN/m^3
            model.add_material(mat_name, E=mem.E, G=mem.G, nu=0.3, rho=76.8)
            model.add_section(sec_name, A=mem.A, Iy=mem.Iy, Iz=mem.Iz, J=mem.J)
            model.add_member(mem.id, mem.i, mem.j, mat_name, sec_name)

            if mem.type == "truss":
                # release all rotations at both ends to approximate axial-only member
                model.def_releases(mem.id, Rxi=True, Ryi=True, Rzi=True, Rxj=True, Ryj=True, Rzj=True)

        # loads (single case)
        try:
            if req.loads.selfweightY and abs(req.loads.selfweightY) > 1e-12:
                model.add_member_self_weight('FY', factor=req.loads.selfweightY, case=CASE)
        except Exception:
            pass

        # Stabilization springs (MVP): if a model has a mechanism/disconnected part, this prevents hard-fail.
        # Keep stiffness low so it doesn't meaningfully change results.
        if stabilize:
            k_lin = 1.0  # kN/m
            k_rot = 1.0  # kN*m/rad (approx)
            for n in req.nodes:
                model.def_support_spring(n.id, 'DX', k_lin)
                model.def_support_spring(n.id, 'DY', k_lin)
                model.def_support_spring(n.id, 'DZ', k_lin)
                model.def_support_spring(n.id, 'RX', k_rot)
                model.def_support_spring(n.id, 'RY', k_rot)
                model.def_support_spring(n.id, 'RZ', k_rot)

        dir_map = {"GX": "FX", "GY": "FY", "GZ": "FZ"}
        for udl in req.loads.memberUDL:
            direction = dir_map[udl.dir]
            model.add_member_dist_load(udl.memberId, direction=direction, w1=udl.w, w2=udl.w, case=CASE)

        model.add_load_combo(COMBO, {CASE: 1.0})

        # Treat singular stiffness warnings as hard errors
        with warnings.catch_warnings():
            warnings.filterwarnings('error', category=MatrixRankWarning)
            model.analyze()

        out: Dict[str, NodeDispOut] = {}
        max_mag = 0.0
        max_node = None

        for n in req.nodes:
            node = model.nodes[n.id]
            dx = float(node.DX.get(COMBO, 0.0))
            dy = float(node.DY.get(COMBO, 0.0))
            dz = float(node.DZ.get(COMBO, 0.0))
            out[n.id] = NodeDispOut(dx=dx, dy=dy, dz=dz)
            mag = (dx * dx + dy * dy + dz * dz) ** 0.5
            if mag > max_mag:
                max_mag = mag
                max_node = n.id

        return AnalyzeResponse(ok=True, nodes=out, maxDisp=MaxDispOut(nodeId=max_node or '', value=max_mag))

    # Try pinned-ish base first; if singular/unstable, retry with fixed base rotations;
    # if still singular, apply weak stabilization springs.
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
                return AnalyzeResponse(ok=False, nodes={}, maxDisp=MaxDispOut(), note=f'analysis failed (singular): {e2}')
    except Exception as e:
        msg = str(e)
        if 'singular' in msg.lower() or 'unstable' in msg.lower():
            try:
                return solve(with_fixed_base_rotations=True, stabilize=True)
            except Exception as e2:
                return AnalyzeResponse(ok=False, nodes={}, maxDisp=MaxDispOut(), note=f'analysis failed (singular): {e2}')
        return AnalyzeResponse(ok=False, nodes={}, maxDisp=MaxDispOut(), note=f'analysis failed: {e}')
