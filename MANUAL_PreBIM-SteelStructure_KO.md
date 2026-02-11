# PreBIM‑SteelStructure — 사용자 매뉴얼 (MVP)

> 브라우저에서 철골 구조 컨셉 모델링 + 간단 구조해석(PyNite)을 빠르게 수행하는 웹 앱입니다.
>
> **웹 앱**: https://www.bimarchi-pg.com/prebim/
>
> 업데이트가 안 보이면 캐시 버스터로 접속하세요:
> `https://www.bimarchi-pg.com/prebim/?v=<timestamp>#/editor/<projectId>`

---

## 목차
- [파트 A — 모델 편집(Editor)](#파트-a--모델-편집editor)
  - [A1) 프로젝트](#a1-프로젝트)
  - [A2) 에디터 화면 구성](#a2-에디터-화면-구성)
  - [A3) 그리드](#a3-그리드)
  - [A4) 레벨(Levels)](#a4-레벨levels)
  - [A5) 옵션](#a5-옵션)
  - [A6) 프로파일(단면)](#a6-프로파일단면)
  - [A7) 오버라이드(부재별 단면 지정)](#a7-오버라이드부재별-단면-지정)
  - [A8) Boxes / Member 모드(자유 부재)](#a8-boxes--member-모드자유-부재)
  - [A9) 수량/중량(Quantities)](#a9-수량중량quantities)
  - [A10) 내보내기(Exports)](#a10-내보내기exports)
- [파트 B — 구조계산(Analysis)](#파트-b--구조계산analysis)
  - [B1) 개요](#b1-개요)
  - [B2) 지점(Supports)](#b2-지점supports)
  - [B3) 접합/단부조건(Connections)](#b3-접합단부조건connections)
  - [B4) 하중(Loads)](#b4-하중loads)
  - [B5) 풍하중(KDS) 보조 팝업 — 식/가정](#b5-풍하중kds-보조-팝업--식가정)
  - [B6) 지진하중(KDS ELF) 보조 팝업 — 식/가정](#b6-지진하중kds-elf-보조-팝업--식가정)
  - [B7) 하중조합(Combo 생성 로직)](#b7-하중조합combo-생성-로직)
  - [B8) 제한사항](#b8-제한사항)

---

# 파트 A — 모델 편집(Editor)

## A1) 프로젝트
- **New project**: 이 브라우저의 localStorage에 프로젝트 생성
- **Open**: 에디터 열기
- **Export**: JSON 스냅샷 다운로드
- **Delete**: localStorage에서 삭제
- **Import project (.json)**: Export한 JSON 복원

## A2) 에디터 화면 구성
- **Tools(좌측)**: 그리드/레벨/옵션/프로파일 입력
- **3D View(중앙)**: 프레임 3D 뷰
- **Quantities(하단)**: 수량/중량 요약(상단바에서 토글)

분할바:
- 세로 분할: 패널 폭 조절
- 가로 분할: Quantities 높이 조절(열려 있을 때)

## A3) 그리드
- **X spans (mm, 콤마 구분)** 예: `6000,6000,8000`
- **Y spans (mm, 콤마 구분)** 예: `6000,6000`

규칙:
- `그리드 라인 개수 = spans 개수 + 1`

입력 변경은 실시간 적용됩니다.

## A4) 레벨(Levels)
- 레벨은 **절대 높이(mm)** 입니다(층고가 아님).
- **Add level**: 새 레벨 추가
- 리스트에서 직접 값 수정 가능

## A5) 옵션
### 서브빔(Sub‑beams)
- **Enable**: 켜기/끄기
- **Count / bay**: 베이당 서브빔 개수

### 가새(Bracing, 패널 기반)
- 3D 상단에서 **Bracing** 팝업을 엽니다.
- 팝업이 열린 동안 3D에서 패널을 클릭해 가새를 토글합니다.
- 가새 타입:
  - **X**: X자 가새
  - **/**: 단일 대각
  - **ㅅ(HAT)**: V형(chevron)
- 가새 프로파일은 배치 시 선택값이 저장됩니다.

## A6) 프로파일(단면)
표준/단면 선택은 기본 단면을 지정합니다:
- Column
- Beam
- Sub‑beam
- Brace

## A7) 오버라이드(부재별 단면 지정)
3D 상단에서 **Override** 팝업:

- 3D에서 부재를 선택하면, Override의 **Shape/Profile 메뉴가 선택 부재 기준으로 자동 동기화**됩니다.
  - 해당 부재에 이미 override가 있으면 그 값을 표시
  - 없으면 부재 종류(기둥/보/서브빔/가새)의 기본 단면을 표시
- 여러 부재를 선택한 경우, **선택 목록 중 대표 1개(첫 번째)** 기준으로 표시됩니다.
- 메뉴에서 Profile을 바꾸면 **선택된 모든 부재**에 적용됩니다.

버튼:
- **Clear**: 선택 해제
- **Reset**: 모든 override 삭제(확인 필요)

## A8) Boxes / Member 모드(자유 부재)
Boxes를 이용해 3D에서 클릭으로 추가 부재(secondary framing, post, brace 등)를 만들 수 있습니다.

### Member 모드
- 도구를 **Members**로 전환
- 3D에서 edge/diag를 클릭하면 자유 부재가 생성됨
- **중복 부재 방지**: 같은 세그먼트(i‑j 또는 j‑i)가 이미 있으면 추가하지 않고 짧은 메시지를 표시

### 생성 단면 반영
- Member 모드에서 선택한 단면(profile)은 생성되는 부재에 저장됩니다.
- 저장된 profile은 **Quantities와 Analysis 모두에 반영**됩니다(beam/brace/column 모두 지원).

### Delete 모드
- Delete 모드에서 클릭으로 삭제 목록에 추가 후 일괄 삭제

## A9) 수량/중량(Quantities)
- 상단바에서 열기/닫기
- 항목별 길이(m), 개수, kg/m, 중량(kg, t) 표시
- **Copy Excel**: TSV 형태로 클립보드 복사

## A10) 내보내기(Exports)
상단 Export 메뉴:
- **DATA**: 프로젝트 + engineModel JSON
- **STAAD(MVP)**: 형상 위주(조인트/부재)
- **DXF(MVP)**: 평면 + 자동 치수
- **IFC**: placeholder 헤더

---

# 파트 B — 구조계산(Analysis)

## B1) 개요
Analysis 페이지는 Editor 모델로부터 3D 프레임 해석 모델을 구성하고, 분석 API로 해석합니다.

- 해석 라이브러리: **PyNite** (`Pynite.FEModel3D`)
- API(nginx 프록시 구성 시):
  - `POST /prebim/api/analyze`

## B2) 지점(Supports)
- 타입:
  - **PINNED**: 변위 구속, 회전은 해제(힌지)
  - **FIXED**: 변위+회전 구속(고정)
- **Supports (node ids)**: 콤마 구분 입력
- **Edit supports**: 체크 후 3D에서 베이스 노드 클릭으로 토글
- **Rigid diaphragm**: 층별 X/Z 방향으로 노드 결속(안정화 보조)

## B3) 접합/단부조건(Connections)
- 3D에서 부재 선택 후 i/j 단부를 **PIN/FIXED**로 설정

참고(구현 기준):
- PIN은 local y/z 휨회전을 release
- local x 비틀림은 메커니즘 방지를 위해 유지

## B4) 하중(Loads)
### D (Dead)
- 자중은 PyNite의 member self‑weight를 global Y 방향으로 적용

### L/S (Live/Snow) → 부재 등분포 하중(Story 1)
현재 MVP는 Story 1의 보/서브빔에 면하중(q)을 선하중(w)으로 변환하여 적용합니다.

- 입력: `qL`, `qS` (kN/m²)
- 변환:
  - `wL (kN/m) = qL × trib`
  - `wS (kN/m) = qS × trib`
  - 하향 적용: `w = -wL`, `w = -wS`

Trib(공동면적 폭) 개요:
- BeamX: 인접 Y span의 1/2씩
- BeamY: 인접 X span의 1/2씩
- Sub‑beam: bay 폭 / `(subCount + 1)`

### 집중하중(Point loads)
- **Point loads** 패널을 열면 노드 선택 모드
- 노드 클릭 시 현재 Fx/Fy/Fz(kN)로 P# 생성
- 리스트에서 선택 후 Update/Delete/Clear 가능

현재 적용:
- 집중하중은 **D 케이스**에 노달하중으로 적용
  - Fx→GX, Fy→GY, Fz→GZ

## B5) 풍하중(KDS) 보조 팝업 — 식/가정
직접 base shear 입력 또는 KDS 보조 팝업을 사용할 수 있습니다.

해석 반영 규칙:
- story force 배열이 있으면 층별 노드에 분배
- 없으면 base shear를 top nodes에 분배

구현된 핵심 식(코드 기준):
- `KHr = KzrAt(exposure, H)`
- `KzrAt(exp,z) = max(1.0, (z/10)^alpha)`
  - `alpha = 0.22(B), 0.15(C), 0.11(D)`
- `VH = Vo · Kd · KHr · Kzt · Iw`
- `qH = (0.5 · ρ · VH²) / 1000`  (kN/m²)

Enclosed:
- `Pf = kz · qH · GD · (Cpe1 − Cpe2)`

Open:
- `kz(z)=z/H` (층 상단 높이)
- `Pf_story = kz_story · qH · GD · CD`
- CD 자동추정은 heuristic(프로젝션 면적 기반)

층하중:
- `F_story = Pf_story · Breadth · storyHeight`

기초전단:
- `V_base = Σ F_story`

## B6) 지진하중(KDS ELF) 보조 팝업 — 식/가정
주기:
- `T = Ct · hn^x`

스펙트럼(구현 기준):
- `SDS = S · 2.5 · Fa · (2/3)`
- `SD1 = S · Fv · (2/3)`

Cs:
- `cs_raw = SDS / (R/Ie)`
- `cs_max = SD1 / ((R/Ie) · T)`
- `cs_min = max(0.01, 0.044 · SDS · Ie)`
- `Cs = clamp(cs_raw, cs_min, cs_max)` (cs_max>0일 때)

기초전단:
- `V = Cs · W`

W(초기값 자동추정):
- 철골 자중(Quantities 기반) + 0.25·L(면적×층수)

층분배:
- `Fi = (wi·hi^k / Σ(wj·hj^k)) · V`

참고: 현재 UI는 동일 Fi를 X/Z에 같이 적용합니다.

## B7) 하중조합(Combo 생성 로직)
`buildAnalysisPayload()`에서 하드코딩된 조합을 생성합니다.

케이스:
- `D, L, S, WX/WZ, EQX/EQZ`

Strength(구현 기준):
- `D`: `{ D: 1.4 }`
- `D+L`: `{ D: 1.2, L: 1.0 }`
- `D+L+S`: `{ D: 1.2, L: 1.0, S: 1.6 }` (snow)
- `D+W*`: `{ D: 0.9, W*: 1.0 }` (wind)
- `D+EQ*`: `{ D: 0.9, EQ*: 1.0 }` (seismic)
- `D+L+W*+S`: `{ D: 1.2, L: 1.6, W*: 1.0, S: 0.5 }` (snow+wind)

ASD(구현 기준):
- `D`: `{ D: 1.0 }`
- `D+L`: `{ D: 1.0, L: 0.75 }`
- `D+S`: `{ D: 1.0, S: 0.75 }` (snow)
- `D+L+S`: `{ D: 1.0, L: 0.75, S: 0.75 }` (snow)
- `D+W*`: `{ D: 0.6, W*: 0.45 }` (wind)
- `D+EQ*`: `{ D: 0.6, EQ*: 0.7 }` (seismic)

참고:
- 샘플 워크플로우 기반 단순화된 매핑입니다.
- Z방향 조합은 Z하중이 0이면 생성되지 않습니다(스토리 배열이 있으면 예외).

## B8) 제한사항
- L/S UDL 분배는 현재 Story 1만 대상으로 합니다.
- KDS 보조 팝업은 일부 단순화/heuristic이 포함됩니다.
- 컨셉 검토용이며, 최종 설계는 상세 모델링/검증이 필요합니다.
