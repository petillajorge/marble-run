import * as THREE from 'three';

export type PatternType = 'solid' | 'stripes' | 'dots' | 'swirl';

export interface MarbleCustomization {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  pattern: PatternType;
  isPlayer: boolean;
}

export function generateMarbleTexture(primaryHex: string, secondaryHex: string, pattern: PatternType): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = secondaryHex;
  ctx.strokeStyle = secondaryHex;

  if (pattern === 'stripes') {
    const numStripes = 6;
    const stripeWidth = canvas.width / (numStripes * 2);
    for (let i = 0; i < numStripes; i++) {
      ctx.fillRect(i * stripeWidth * 2, 0, stripeWidth, canvas.height);
    }
  } else if (pattern === 'dots') {
    const radius = 24;
    for (let x = 32; x < canvas.width; x += 64) {
      for (let y = 32; y < canvas.height; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'swirl') {
    ctx.lineWidth = 32;
    for (let i = -canvas.width; i < canvas.width * 2; i += 80) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.bezierCurveTo(i + 100, canvas.height / 2, i - 100, canvas.height / 2, i + 200, canvas.height);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
