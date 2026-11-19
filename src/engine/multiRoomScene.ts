import * as THREE from 'three';
import type { SpatialAnchor } from '../types/recon';
import type { ProceduralTextureSet } from './proceduralTextures';

export interface MultiRoomRig {
  root: THREE.Group;
  scannableMeshes: THREE.Mesh[];
  occluderMeshes: THREE.Mesh[];
  mirrorPlaneMesh: THREE.Mesh;
  mirrorWorldPlane: THREE.Plane;
  mirrorBounds: {
    x: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  };
  dividingWallZ: number;
  doorwayXRange: [number, number];
  doorwayMaxY: number;
  setPhysicalVisibility: (colorWrite: boolean) => void;
  dispose: () => void;
}

export const ROOM_PRESETS = {
  room_a: {
    label: 'Oda 1',
    position: new THREE.Vector3(0.15, 1.52, 1.45),
    target: new THREE.Vector3(0.0, 1.25, -1.6),
  },
  mirror_wall: {
    label: 'Ayna Önü',
    position: new THREE.Vector3(-1.35, 1.44, -0.55),
    target: new THREE.Vector3(-3.1, 1.38, -0.7),
  },
  macro_desk: {
    label: 'Makro Masa',
    position: new THREE.Vector3(1.18, 1.05, -0.35),
    target: new THREE.Vector3(1.52, 0.87, -0.78),
  },
  doorway: {
    label: 'Kapı Eşiği',
    position: new THREE.Vector3(0.0, 1.52, -2.55),
    target: new THREE.Vector3(0.0, 1.35, -5.8),
  },
  room_b: {
    label: 'Oda 2',
    position: new THREE.Vector3(1.35, 1.52, -4.65),
    target: new THREE.Vector3(0.8, 1.32, -2.95),
  },
} as const;

interface TaggedMeta {
  room: 'Oda 1' | 'Oda 2';
  surfaceType: SpatialAnchor['surfaceType'];
  isMirror?: boolean;
  isMacro?: boolean;
}

function tagMesh(mesh: THREE.Mesh, meta: TaggedMeta) {
  mesh.userData = { ...mesh.userData, ...meta };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

/**
 * Builds a realistic two-room architectural space separated by a solid dividing wall
 * with an open doorway, a wall mirror in Room 1 (for testing Mirror Guard),
 * a macro workbench with composite 3-12 part subjects (for 8-45cm macro meshing),
 * and a second gallery room (Room 2) to verify zero wall bleed-through occlusion.
 */
export function buildMultiRoomScene(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): MultiRoomRig {
  const root = new THREE.Group();
  root.name = 'MultiRoomArchitecture';

  const scannableMeshes: THREE.Mesh[] = [];
  const occluderMeshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const registerMesh = (mesh: THREE.Mesh, meta: TaggedMeta, parent: THREE.Object3D = root) => {
    tagMesh(mesh, meta);
    parent.add(mesh);
    scannableMeshes.push(mesh);
    occluderMeshes.push(mesh);
    return mesh;
  };

  // Materials
  const wallMatA = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.plasterWallA,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const wallMatB = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.plasterWallB,
      roughness: 0.82,
      metalness: 0.06,
    }),
  );
  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161c26,
      roughness: 0.45,
      metalness: 0.25,
    }),
  );
  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.slateFloor,
      roughness: 0.62,
      metalness: 0.12,
    }),
  );
  const ceilingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x202631,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const walnutMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.walnutWood,
      roughness: 0.56,
      metalness: 0.05,
    }),
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222936,
      roughness: 0.34,
      metalness: 0.82,
      roughnessMap: textures.brushedMetalRoughness,
    }),
  );
  const brushedAluminumMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xcbd5e1,
      roughness: 0.2,
      metalness: 0.94,
      roughnessMap: textures.brushedMetalRoughness,
      clearcoat: 0.35,
    }),
  );
  const brassAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4a054,
      roughness: 0.26,
      metalness: 0.88,
    }),
  );
  const ceramicMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd8d3c8,
      roughness: 0.18,
      metalness: 0.04,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    }),
  );
  const mirrorGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xdbeafe,
      roughness: 0.03,
      metalness: 0.98,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.9,
    }),
  );
  const lensGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.42 : 1.0,
      ior: 1.52,
      thickness: 0.12,
      clearcoat: 1.0,
    }),
  );
  const calibrationMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.calibrationCard,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  const galleryArtMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.galleryArtwork,
      roughness: 0.48,
      metalness: 0.06,
    }),
  );
  const sculptureMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      roughness: 0.28,
      metalness: 0.78,
      clearcoat: 0.45,
    }),
  );
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    }),
  );

  // =========================================================================
  // 1. ARCHITECTURAL SHELL (ODA 1: z in [-3.0, 2.4], ODA 2: z in [-8.2, -3.24])
  // =========================================================================
  const roomW = 6.4; // x in [-3.2, +3.2]
  const roomH = 2.78;
  const totalDepth = 10.6; // z in [-8.2, +2.4]
  const centerZ = -2.9;

  // Floor (Oda 1 & Oda 2 split for room tagging)
  const floorA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roomW, 0.12, 5.4)), floorMat);
  floorA.position.set(0, -0.06, -0.3);
  registerMesh(floorA, { room: 'Oda 1', surfaceType: 'Zemin' });

  const floorB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roomW, 0.12, 5.2)), floorMat);
  floorB.position.set(0, -0.06, -5.6);
  registerMesh(floorB, { room: 'Oda 2', surfaceType: 'Zemin' });

  // Ceiling (Oda 1 & Oda 2)
  const ceilA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roomW, 0.12, 5.4)), ceilingMat);
  ceilA.position.set(0, roomH + 0.06, -0.3);
  registerMesh(ceilA, { room: 'Oda 1', surfaceType: 'Duvar' });

  const ceilB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roomW, 0.12, 5.2)), ceilingMat);
  ceilB.position.set(0, roomH + 0.06, -5.6);
  registerMesh(ceilB, { room: 'Oda 2', surfaceType: 'Duvar' });

  // Exterior Side Walls (Left x=-3.2, Right x=+3.2) split by room
  const wallThick = 0.18;
  const leftWallA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(wallThick, roomH, 5.4)), wallMatA);
  leftWallA.position.set(-3.2 - wallThick / 2, roomH / 2, -0.3);
  registerMesh(leftWallA, { room: 'Oda 1', surfaceType: 'Duvar' });

  const rightWallA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(wallThick, roomH, 5.4)), wallMatA);
  rightWallA.position.set(3.2 + wallThick / 2, roomH / 2, -0.3);
  registerMesh(rightWallA, { room: 'Oda 1', surfaceType: 'Duvar' });

  const backWallA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roomW + wallThick * 2, roomH, wallThick)), wallMatA);
  backWallA.position.set(0, roomH / 2, 2.4 + wallThick / 2);
  registerMesh(backWallA, { room: 'Oda 1', surfaceType: 'Duvar' });

  const leftWallB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(wallThick, roomH, 5.2)), wallMatB);
  leftWallB.position.set(-3.2 - wallThick / 2, roomH / 2, -5.6);
  registerMesh(leftWallB, { room: 'Oda 2', surfaceType: 'Duvar' });

  const rightWallB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(wallThick, roomH, 5.2)), wallMatB);
  rightWallB.position.set(3.2 + wallThick / 2, roomH / 2, -5.6);
  registerMesh(rightWallB, { room: 'Oda 2', surfaceType: 'Duvar' });

  const farWallB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roomW + wallThick * 2, roomH, wallThick)), wallMatB);
  farWallB.position.set(0, roomH / 2, -8.2 - wallThick / 2);
  registerMesh(farWallB, { room: 'Oda 2', surfaceType: 'Duvar' });

  // SOLID DIVIDING WALL BETWEEN ODA 1 AND ODA 2 (z = -3.12, thickness = 0.24)
  // Doorway opening: x in [-0.66, 0.66], y in [0, 2.16]
  const dividingWallZ = -3.12;
  const divThick = 0.24;
  const doorwayHalfW = 0.66;
  const doorwayH = 2.16;
  const sidePanelW = 3.2 - doorwayHalfW; // 2.54m

  const divLeft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(sidePanelW, roomH, divThick)), wallMatA);
  divLeft.position.set(-doorwayHalfW - sidePanelW / 2, roomH / 2, dividingWallZ);
  registerMesh(divLeft, { room: 'Oda 1', surfaceType: 'Duvar' });

  const divRight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(sidePanelW, roomH, divThick)), wallMatA);
  divRight.position.set(doorwayHalfW + sidePanelW / 2, roomH / 2, dividingWallZ);
  registerMesh(divRight, { room: 'Oda 1', surfaceType: 'Duvar' });

  const divHeader = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(doorwayHalfW * 2, roomH - doorwayH, divThick)),
    wallMatA,
  );
  divHeader.position.set(0, doorwayH + (roomH - doorwayH) / 2, dividingWallZ);
  registerMesh(divHeader, { room: 'Oda 1', surfaceType: 'Duvar' });

  // Doorway Frame Jambs & Lintel (3-part composite architectural frame)
  const doorFrameGroup = new THREE.Group();
  const jambGeo = trackGeo(new THREE.BoxGeometry(0.07, doorwayH, divThick + 0.04));
  const leftJamb = new THREE.Mesh(jambGeo, trimMat);
  leftJamb.position.set(-doorwayHalfW + 0.035, doorwayH / 2, dividingWallZ);
  registerMesh(leftJamb, { room: 'Oda 1', surfaceType: 'Duvar' }, doorFrameGroup);

  const rightJamb = new THREE.Mesh(jambGeo, trimMat);
  rightJamb.position.set(doorwayHalfW - 0.035, doorwayH / 2, dividingWallZ);
  registerMesh(rightJamb, { room: 'Oda 1', surfaceType: 'Duvar' }, doorFrameGroup);

  const lintel = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(doorwayHalfW * 2, 0.07, divThick + 0.04)),
    trimMat,
  );
  lintel.position.set(0, doorwayH - 0.035, dividingWallZ);
  registerMesh(lintel, { room: 'Oda 1', surfaceType: 'Duvar' }, doorFrameGroup);
  root.add(doorFrameGroup);

  // Baseboards along side walls
  const baseboardGeo = trackGeo(new THREE.BoxGeometry(0.03, 0.09, totalDepth));
  const bbL = new THREE.Mesh(baseboardGeo, trimMat);
  bbL.position.set(-3.185, 0.045, centerZ);
  registerMesh(bbL, { room: 'Oda 1', surfaceType: 'Duvar' });
  const bbR = new THREE.Mesh(baseboardGeo, trimMat);
  bbR.position.set(3.185, 0.045, centerZ);
  registerMesh(bbR, { room: 'Oda 1', surfaceType: 'Duvar' });

  // =========================================================================
  // 2. WALL MIRROR ASSEMBLY IN ODA 1 (6-part composite reflective surface)
  // =========================================================================
  const mirrorGroup = new THREE.Group();
  const mirrorX = -3.15;
  const mirrorY = 1.4;
  const mirrorZ = -0.7;
  const mirrorW = 1.62;
  const mirrorH = 1.24;

  // Reflective mirror pane (tagged isMirror = true for Mirror Guard testing!)
  const mirrorPlaneMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.025, mirrorH - 0.1, mirrorW - 0.1)),
    mirrorGlassMat,
  );
  mirrorPlaneMesh.position.set(mirrorX + 0.02, mirrorY, mirrorZ);
  registerMesh(
    mirrorPlaneMesh,
    { room: 'Oda 1', surfaceType: 'Ayna Düzlemi', isMirror: true },
    mirrorGroup,
  );

  // Brushed aluminum beveled frame (4 perimeter rails)
  const railDepth = 0.06;
  const railThick = 0.055;
  const topRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(railDepth, railThick, mirrorW)),
    brushedAluminumMat,
  );
  topRail.position.set(mirrorX + 0.03, mirrorY + mirrorH / 2 - railThick / 2, mirrorZ);
  registerMesh(topRail, { room: 'Oda 1', surfaceType: 'Duvar' }, mirrorGroup);

  const botRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(railDepth, railThick, mirrorW)),
    brushedAluminumMat,
  );
  botRail.position.set(mirrorX + 0.03, mirrorY - mirrorH / 2 + railThick / 2, mirrorZ);
  registerMesh(botRail, { room: 'Oda 1', surfaceType: 'Duvar' }, mirrorGroup);

  const sideRailGeo = trackGeo(new THREE.BoxGeometry(railDepth, mirrorH - railThick * 2, railThick));
  const frontRail = new THREE.Mesh(sideRailGeo, brushedAluminumMat);
  frontRail.position.set(mirrorX + 0.03, mirrorY, mirrorZ + mirrorW / 2 - railThick / 2);
  registerMesh(frontRail, { room: 'Oda 1', surfaceType: 'Duvar' }, mirrorGroup);

  const backRail = new THREE.Mesh(sideRailGeo, brushedAluminumMat);
  backRail.position.set(mirrorX + 0.03, mirrorY, mirrorZ - mirrorW / 2 + railThick / 2);
  registerMesh(backRail, { room: 'Oda 1', surfaceType: 'Duvar' }, mirrorGroup);

  // Overhead sconce bar above mirror
  const sconceBar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 16)),
    brassAccentMat,
  );
  sconceBar.rotation.x = Math.PI / 2;
  sconceBar.position.set(mirrorX + 0.14, mirrorY + mirrorH / 2 + 0.13, mirrorZ);
  registerMesh(sconceBar, { room: 'Oda 1', surfaceType: 'Duvar' }, mirrorGroup);

  root.add(mirrorGroup);

  // =========================================================================
  // 3. MACRO WORKBENCH & PRECISION CLOSE-UP OBJECTS IN ODA 1
  // =========================================================================
  const deskGroup = new THREE.Group();
  const deskX = 1.62;
  const deskZ = -0.82;
  const deskW = 1.48;
  const deskD = 0.84;
  const deskH = 0.78;

  // Desk surface
  const deskTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(deskW, 0.045, deskD)), walnutMat);
  deskTop.position.set(deskX, deskH - 0.0225, deskZ);
  registerMesh(deskTop, { room: 'Oda 1', surfaceType: 'Masa / Makro' }, deskGroup);

  // Steel frame legs (4 legs + crossbar)
  const legGeo = trackGeo(new THREE.BoxGeometry(0.045, deskH - 0.045, 0.045));
  const legOffsets: [number, number][] = [
    [-deskW / 2 + 0.07, -deskD / 2 + 0.07],
    [deskW / 2 - 0.07, -deskD / 2 + 0.07],
    [-deskW / 2 + 0.07, deskD / 2 - 0.07],
    [deskW / 2 - 0.07, deskD / 2 - 0.07],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, darkSteelMat);
    leg.position.set(deskX + lx, (deskH - 0.045) / 2, deskZ + lz);
    registerMesh(leg, { room: 'Oda 1', surfaceType: 'Masa / Makro' }, deskGroup);
  }
  const crossbar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(deskW - 0.16, 0.035, 0.035)), darkSteelMat);
  crossbar.position.set(deskX, 0.22, deskZ - deskD / 2 + 0.07);
  registerMesh(crossbar, { room: 'Oda 1', surfaceType: 'Masa / Makro' }, deskGroup);

  // Desk floor contact shadow
  const deskShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(deskW * 1.25, deskD * 1.28)), contactShadowMat);
  deskShadow.rotation.x = -Math.PI / 2;
  deskShadow.position.set(deskX, 0.012, deskZ);
  deskGroup.add(deskShadow);

  // --- MACRO SUBJECT 1: Precision Optical Macro Lens Assembly (6-part composite) ---
  const lensGroup = new THREE.Group();
  lensGroup.position.set(deskX - 0.08, deskH, deskZ + 0.02);

  const lensBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.064, 0.068, 0.028, 32)),
    darkSteelMat,
  );
  lensBase.position.y = 0.014;
  registerMesh(lensBase, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, lensGroup);

  const lensMidBarrel = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.058, 0.062, 0.068, 32)),
    darkSteelMat,
  );
  lensMidBarrel.position.y = 0.062;
  registerMesh(lensMidBarrel, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, lensGroup);

  const focusRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.063, 0.063, 0.022, 32)),
    brushedAluminumMat,
  );
  focusRing.position.y = 0.07;
  registerMesh(focusRing, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, lensGroup);

  const brassTrimRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.059, 0.0045, 12, 32)),
    brassAccentMat,
  );
  brassTrimRing.rotation.x = Math.PI / 2;
  brassTrimRing.position.y = 0.097;
  registerMesh(brassTrimRing, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, lensGroup);

  const frontElement = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.048, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42)),
    lensGlassMat,
  );
  frontElement.position.y = 0.088;
  registerMesh(frontElement, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, lensGroup);

  const lensHood = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.066, 0.059, 0.032, 32, 1, true)),
    darkSteelMat,
  );
  lensHood.material.side = THREE.DoubleSide;
  lensHood.position.y = 0.112;
  registerMesh(lensHood, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, lensGroup);
  deskGroup.add(lensGroup);

  // --- MACRO SUBJECT 2: Sculpted Ceramic Espresso Mug (Lathe + Tube handle) ---
  const mugGroup = new THREE.Group();
  mugGroup.position.set(deskX - 0.34, deskH, deskZ + 0.08);
  const mugProfile = [
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(0.04, 0.0),
    new THREE.Vector2(0.048, 0.025),
    new THREE.Vector2(0.051, 0.082),
    new THREE.Vector2(0.048, 0.098),
    new THREE.Vector2(0.041, 0.098),
    new THREE.Vector2(0.039, 0.015),
    new THREE.Vector2(0.001, 0.015),
  ];
  const mugBody = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(mugProfile, 28)), ceramicMat);
  registerMesh(mugBody, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, mugGroup);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.047, 0.078, 0),
    new THREE.Vector3(0.078, 0.072, 0),
    new THREE.Vector3(0.076, 0.035, 0),
    new THREE.Vector3(0.045, 0.028, 0),
  ]);
  const mugHandle = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(handleCurve, 18, 0.007, 10, false)),
    ceramicMat,
  );
  registerMesh(mugHandle, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, mugGroup);
  deskGroup.add(mugGroup);

  // --- MACRO SUBJECT 3: Millimeter Calibration Target & Stair-Step Gauge ---
  const calibPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.008, 0.18)), calibrationMat);
  calibPlate.position.set(deskX + 0.24, deskH + 0.004, deskZ + 0.06);
  registerMesh(calibPlate, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, deskGroup);

  // 3 stepped precision blocks (1cm, 2.5cm, 4cm) to test fine macro side-walls
  for (let step = 0; step < 3; step++) {
    const h = 0.016 + step * 0.016;
    const block = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.042, h, 0.064)),
      step === 1 ? brassAccentMat : brushedAluminumMat,
    );
    block.position.set(deskX + 0.17 + step * 0.046, deskH + 0.008 + h / 2, deskZ - 0.11);
    registerMesh(block, { room: 'Oda 1', surfaceType: 'Masa / Makro', isMacro: true }, deskGroup);
  }

  root.add(deskGroup);

  // =========================================================================
  // 4. ODA 2 (NEXT ROOM — GALLERY PEDESTAL, SCULPTURE, BENCH, WALL ART)
  // =========================================================================
  const roomBGroup = new THREE.Group();

  // Pedestal + Sculptural Knot (Room 2 focal landmark)
  const pedX = -1.25;
  const pedZ = -5.45;
  const pedBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.08, 0.68)), darkSteelMat);
  pedBase.position.set(pedX, 0.04, pedZ);
  registerMesh(pedBase, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  const pedColumn = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.94, 0.56)), wallMatA);
  pedColumn.position.set(pedX, 0.08 + 0.47, pedZ);
  registerMesh(pedColumn, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  const pedCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.04, 0.62)), brushedAluminumMat);
  pedCap.position.set(pedX, 1.04, pedZ);
  registerMesh(pedCap, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  const sculpture = new THREE.Mesh(
    trackGeo(new THREE.TorusKnotGeometry(0.24, 0.068, 96, 18, 2, 3)),
    sculptureMat,
  );
  sculpture.position.set(pedX, 1.44, pedZ);
  registerMesh(sculpture, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  const pedShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.1, 1.1)), contactShadowMat);
  pedShadow.rotation.x = -Math.PI / 2;
  pedShadow.position.set(pedX, 0.012, pedZ);
  roomBGroup.add(pedShadow);

  // Gallery Bench (4-part composite)
  const benchX = 1.45;
  const benchZ = -5.75;
  const benchTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.42, 0.07, 0.52)), walnutMat);
  benchTop.position.set(benchX, 0.44, benchZ);
  registerMesh(benchTop, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  const benchLegGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.405, 0.46));
  const bLegL = new THREE.Mesh(benchLegGeo, darkSteelMat);
  bLegL.position.set(benchX - 0.54, 0.2025, benchZ);
  registerMesh(bLegL, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  const bLegR = new THREE.Mesh(benchLegGeo, darkSteelMat);
  bLegR.position.set(benchX + 0.54, 0.2025, benchZ);
  registerMesh(bLegR, { room: 'Oda 2', surfaceType: 'Heykel / Obje' }, roomBGroup);

  // Framed Wall Print on far wall of Room 2 (z = -8.14)
  const artFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.88, 1.18, 0.05)), trimMat);
  artFrame.position.set(0.0, 1.54, -8.17);
  registerMesh(artFrame, { room: 'Oda 2', surfaceType: 'Duvar' }, roomBGroup);

  const artCanvas = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.74, 1.04, 0.02)), galleryArtMat);
  artCanvas.position.set(0.0, 1.54, -8.14);
  registerMesh(artCanvas, { room: 'Oda 2', surfaceType: 'Duvar' }, roomBGroup);

  root.add(roomBGroup);

  // Mirror geometric plane: normal points into Room 1 (+X), positioned at x = -3.118
  const mirrorWorldPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 3.118);

  const setPhysicalVisibility = (colorWrite: boolean) => {
    for (const mat of materials) {
      if (mat === contactShadowMat) {
        mat.visible = colorWrite;
      } else {
        mat.colorWrite = colorWrite;
        // Always keep depthWrite = true so physical walls STILL act as real hardware depth occluders
        // even when inspecting in Smooth Mesh / Wireframe / Normal modes!
        mat.depthWrite = true;
      }
    }
  };

  return {
    root,
    scannableMeshes,
    occluderMeshes,
    mirrorPlaneMesh,
    mirrorWorldPlane,
    mirrorBounds: {
      x: -3.118,
      yMin: mirrorY - mirrorH / 2,
      yMax: mirrorY + mirrorH / 2,
      zMin: mirrorZ - mirrorW / 2,
      zMax: mirrorZ + mirrorW / 2,
    },
    dividingWallZ,
    doorwayXRange: [-doorwayHalfW, doorwayHalfW],
    doorwayMaxY: doorwayH,
    setPhysicalVisibility,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
