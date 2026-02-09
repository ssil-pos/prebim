from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional

from Pynite import FEModel3D


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


class AnalyzeResponse(BaseModel):
    ok: bool
    nodes: Dict[str, NodeDispOut]
    maxDisp: Dict[str, float]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    # Build model
    model = FEModel3D()

    # Materials/sections: to keep it simple, make per-member unique names
    for n in req.nodes:
        model.add_node(n.id, n.x, n.y, n.z)

    # supports
    for s in req.supports:
        f = s.fix
        model.def_support(
            s.nodeId,
            support_DX=f.DX,
            support_DY=f.DY,
            support_DZ=f.DZ,
            support_RX=f.RX,
            support_RY=f.RY,
            support_RZ=f.RZ,
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

    # loads (single case: "Case 1")
    # selfweight
    try:
        if req.loads.selfweightY and abs(req.loads.selfweightY) > 1e-12:
            # Global -Y typically
            model.add_member_self_weight('FY', factor=req.loads.selfweightY)
    except Exception:
        # Don't hard-fail on self-weight issues in MVP
        pass

    dir_map = {"GX": "FX", "GY": "FY", "GZ": "FZ"}
    for udl in req.loads.memberUDL:
        direction = dir_map[udl.dir]
        model.add_member_dist_load(udl.memberId, direction=direction, w1=udl.w, w2=udl.w)

    model.analyze()

    out: Dict[str, NodeDispOut] = {}
    max_mag = 0.0
    max_node = None

    for n in req.nodes:
        node = model.Nodes[n.id]
        dx = float(node.DX['Case 1'])
        dy = float(node.DY['Case 1'])
        dz = float(node.DZ['Case 1'])
        out[n.id] = NodeDispOut(dx=dx, dy=dy, dz=dz)
        mag = (dx * dx + dy * dy + dz * dz) ** 0.5
        if mag > max_mag:
            max_mag = mag
            max_node = n.id

    return AnalyzeResponse(ok=True, nodes=out, maxDisp={"nodeId": max_node or "", "value": max_mag})
