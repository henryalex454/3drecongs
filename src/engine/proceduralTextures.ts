import * as THREE from 'three';

export interface ProceduralTextureSet {
  plasterWallA: THREE.CanvasTexture;
  plasterWallB: THREE.CanvasTexture;
  slateFloor: THREE.CanvasTexture;
  walnutWood: THREE.CanvasTexture;
  calibrationCard: THREE.CanvasTexture;
  galleryArtwork: THREE.CanvasTexture;
  brushedMetalRoughness: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createPlasterTexture(baseHex: string, speckHex: string, anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle architectural plaster grain
  for (let i = 0; i < 4200; i++) {
    const x = (i * 73) % 256;
    const y = (i * 139 + Math.floor(i / 4)) % 256;
    const alpha = ((i % 7) + 1) * 0.008;
    ctx.fillStyle = speckHex;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  for (let y = 0; y < 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return configureColorTexture(canvas, anisotropy, 3, 2);
}

function createSlateFloorTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#1E242E';
  ctx.fillRect(0, 0, 512, 512);

  const tiles = 4;
  const step = 512 / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const shade = 29 + ((tx * 7 + ty * 13) % 7);
      ctx.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 13})`;
      ctx.fillRect(tx * step + 2, ty * step + 2, step - 4, step - 4);
    }
  }

  // Subtle natural stone micro-grain
  for (let i = 0; i < 3200; i++) {
    const x = (i * 97) % 512;
    const y = (i * 193) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 3, 2);
  }

  // Crisp grout lines
  ctx.strokeStyle = '#11161F';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(512, i * step);
    ctx.stroke();
  }

  return configureColorTexture(canvas, anisotropy, 4, 6);
}

function createWalnutTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5A3D2B');
  grad.addColorStop(0.5, '#4A3122');
  grad.addColorStop(1, '#583A28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  for (let y = 0; y < 256; y += 2) {
    const wave = Math.sin(y * 0.14) * 8 + Math.cos(y * 0.04) * 6;
    ctx.strokeStyle = y % 4 === 0 ? 'rgba(30, 18, 10, 0.25)' : 'rgba(130, 92, 62, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + wave, 340, y - wave, 512, y);
    ctx.stroke();
  }

  return configureColorTexture(canvas, anisotropy, 1, 1);
}

function createCalibrationCardTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  for (let i = 16; i < 256; i += 16) {
    ctx.globalAlpha = i % 64 === 0 ? 0.55 : 0.18;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // High-contrast macro checkerboard fiducials
  const sq = 24;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#0F172A' : '#F8FAFC';
      ctx.fillRect(20 + c * sq, 20 + r * sq, sq, sq);
    }
  }

  // Millimeter ruler bars
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('5mm MACRO', 108, 48);
  ctx.font = '13px monospace';
  ctx.fillText('0.08m - 0.45m', 108, 72);

  for (let x = 20; x <= 236; x += 6) {
    const tall = (x - 20) % 30 === 0;
    ctx.fillRect(x, 210, 2, tall ? 24 : 12);
  }

  // Central target bullseye
  ctx.strokeStyle = '#0D9488';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(164, 146, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(164, 146, 16, 0, Math.PI * 2);
  ctx.stroke();

  return configureColorTexture(canvas, anisotropy, 1, 1);
}

function createGalleryArtworkTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 320);
  ctx.fillStyle = '#141B26';
  ctx.fillRect(0, 0, 512, 320);

  // Geometric architectural bauhaus print for Room B depth feature richness
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(28, 28, 456, 264);

  ctx.fillStyle = '#0F766E';
  ctx.beginPath();
  ctx.arc(176, 168, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#D97706';
  ctx.fillRect(238, 74, 152, 174);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(72, 232);
  ctx.lineTo(436, 92);
  ctx.stroke();

  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.strokeRect(46, 46, 420, 228);

  return configureColorTexture(canvas, anisotropy, 1, 1);
}

function createBrushedMetalRoughness(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#484848';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const v = 50 + ((y * 37) % 45);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.20)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
  const plasterWallA = createPlasterTexture('#2B323D', '#0B0F17', anisotropy);
  const plasterWallB = createPlasterTexture('#242E3D', '#0F172A', anisotropy);
  const slateFloor = createSlateFloorTexture(anisotropy);
  const walnutWood = createWalnutTexture(anisotropy);
  const calibrationCard = createCalibrationCardTexture(anisotropy);
  const galleryArtwork = createGalleryArtworkTexture(anisotropy);
  const brushedMetalRoughness = createBrushedMetalRoughness(anisotropy);
  const contactShadow = createContactShadowTexture();

  return {
    plasterWallA,
    plasterWallB,
    slateFloor,
    walnutWood,
    calibrationCard,
    galleryArtwork,
    brushedMetalRoughness,
    contactShadow,
    dispose: () => {
      plasterWallA.dispose();
      plasterWallB.dispose();
      slateFloor.dispose();
      walnutWood.dispose();
      calibrationCard.dispose();
      galleryArtwork.dispose();
      brushedMetalRoughness.dispose();
      contactShadow.dispose();
    },
  };
}
