import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TrackPieceType, TrackSocket, PlacedTrackPiece, TrackPieceData } from './types';

// Track dimensions
export const TRACK_WIDTH = 1.2;
export const TRACK_WALL_HEIGHT = 0.5;
export const TRACK_THICKNESS = 0.1;
export const MARBLE_RADIUS = 0.25;

// Common materials
const trackMaterial = new THREE.MeshStandardMaterial({
  color: 0x2563eb, // Royal Blue plastic
  roughness: 0.3,
  metalness: 0.1,
  side: THREE.DoubleSide
});

const startGateMaterial = new THREE.MeshStandardMaterial({
  color: 0x16a34a, // Green Start
  roughness: 0.2,
  metalness: 0.2
});

const finishGateMaterial = new THREE.MeshStandardMaterial({
  color: 0xd97706, // Amber Finish
  roughness: 0.2,
  metalness: 0.2
});

const paddleMaterial = new THREE.MeshStandardMaterial({
  color: 0xef4444, // Red paddle
  roughness: 0.2,
  metalness: 0.4
});

const connectorMaterial = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  wireframe: true,
  transparent: true,
  opacity: 0.7
});

// Helper: Extract geometry arrays for Rapier trimesh creation
function createTrimeshCollider(
  world: RAPIER.World,
  mesh: THREE.Mesh,
  parentBody?: RAPIER.RigidBody
): RAPIER.Collider {
  const geometry = mesh.geometry.clone().toNonIndexed();
  const positionAttr = geometry.attributes.position;
  const vertices = new Float32Array(positionAttr.array);
  const indices = new Uint32Array(vertices.length / 3);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = i;
  }

  const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
    .setRestitution(0.3)
    .setFriction(0.4);

  if (parentBody) {
    return world.createCollider(colliderDesc, parentBody);
  } else {
    // Attach as fixed object at mesh world/local transform
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation(mesh.quaternion);
    const body = world.createRigidBody(bodyDesc);
    return world.createCollider(colliderDesc, body);
  }
}

// Track Piece Factory
export function createTrackPiece(
  data: TrackPieceData,
  world: RAPIER.World
): PlacedTrackPiece {
  const group = new THREE.Group();
  group.position.set(...data.position);
  group.rotation.set(...data.rotation);
  group.userData = { pieceId: data.id, type: data.type };

  const sockets: TrackSocket[] = [];
  const colliders: RAPIER.Collider[] = [];

  // Create fixed rigid body for this track piece
  const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(...data.position)
    .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation)));
  const rigidBody = world.createRigidBody(bodyDesc);

  let updateAnimation: ((delta: number) => void) | undefined;
  let gateTrigger: (() => void) | undefined;
  let resetGate: (() => void) | undefined;

  switch (data.type) {
    case 'straight': {
      const length = 4.0;
      const shape = new THREE.Shape();
      // U-channel cross section: (-W/2, H) -> (-W/2, 0) -> (W/2, 0) -> (W/2, H)
      shape.moveTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.closePath();

      const extrudeSettings = { depth: length, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Center along z starting from 0
      geom.translate(0, 0, 0);
      const mesh = new THREE.Mesh(geom, trackMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      colliders.push(createTrimeshCollider(world, mesh, rigidBody));

      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: new THREE.Vector3(0, 0, length),
        localDirection: new THREE.Vector3(0, 0, 1)
      });
      break;
    }

    case 'slope_down': {
      const length = 4.0;
      const drop = 1.5;
      // Extrude along slope path
      const path = new THREE.LineCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -drop, length)
      );

      const shape = new THREE.Shape();
      shape.moveTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.closePath();

      const extrudeSettings = { steps: 1, extrudePath: path, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, trackMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      colliders.push(createTrimeshCollider(world, mesh, rigidBody));

      const dir = new THREE.Vector3(0, -drop, length).normalize();
      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: new THREE.Vector3(0, -drop, length),
        localDirection: dir
      });
      break;
    }

    case 'slope_up': {
      const length = 4.0;
      const rise = 1.0;
      const path = new THREE.LineCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, rise, length)
      );

      const shape = new THREE.Shape();
      shape.moveTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.closePath();

      const extrudeSettings = { steps: 1, extrudePath: path, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, trackMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      colliders.push(createTrimeshCollider(world, mesh, rigidBody));

      const dir = new THREE.Vector3(0, rise, length).normalize();
      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: new THREE.Vector3(0, rise, length),
        localDirection: dir
      });
      break;
    }

    case 'curve_90': {
      const radius = 3.0;
      // 90 degree curve around (radius, 0, 0)
      const curve = new THREE.ArcCurve(radius, 0, radius, Math.PI, Math.PI * 0.5, true);
      const points2D = curve.getPoints(24);
      const points3D = points2D.map(p => new THREE.Vector3(p.x - radius, 0, p.y));
      const path = new THREE.CatmullRomCurve3(points3D);

      const shape = new THREE.Shape();
      shape.moveTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.closePath();

      const extrudeSettings = { steps: 24, extrudePath: path, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, trackMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      colliders.push(createTrimeshCollider(world, mesh, rigidBody));

      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: new THREE.Vector3(-radius, 0, radius),
        localDirection: new THREE.Vector3(-1, 0, 0)
      });
      break;
    }

    case 'loop': {
      const radius = 2.5;
      const points: THREE.Vector3[] = [];
      const segments = 36;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        // Helical loop extending slightly in Z to avoid self-intersecting path
        const z = (i / segments) * 2.0;
        const y = radius - Math.cos(theta) * radius;
        const x = Math.sin(theta) * radius;
        points.push(new THREE.Vector3(x * 0.3, y, z));
      }
      const path = new THREE.CatmullRomCurve3(points);

      const shape = new THREE.Shape();
      shape.moveTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.closePath();

      const extrudeSettings = { steps: 36, extrudePath: path, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, trackMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      colliders.push(createTrimeshCollider(world, mesh, rigidBody));

      const lastPoint = points[points.length - 1];
      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: lastPoint.clone(),
        localDirection: new THREE.Vector3(0, 0, 1)
      });
      break;
    }

    case 'funnel': {
      const outerRadius = 3.0;
      const innerRadius = 0.5;
      const funnelHeight = 1.2;

      // Create funnel geometry bowl
      const points: THREE.Vector2[] = [];
      points.push(new THREE.Vector2(innerRadius, -funnelHeight));
      points.push(new THREE.Vector2(innerRadius + 0.1, -funnelHeight));
      points.push(new THREE.Vector2(outerRadius, 0));
      points.push(new THREE.Vector2(outerRadius + 0.2, 0.5));
      points.push(new THREE.Vector2(outerRadius, 0.5));

      const bowlGeom = new THREE.LatheGeometry(points, 32);
      const bowlMesh = new THREE.Mesh(bowlGeom, trackMaterial);
      bowlMesh.castShadow = true;
      bowlMesh.receiveShadow = true;
      group.add(bowlMesh);

      colliders.push(createTrimeshCollider(world, bowlMesh, rigidBody));

      // Entry chute coming into top of funnel
      const inChuteLength = 2.0;
      const shape = new THREE.Shape();
      shape.moveTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);

      const chuteGeom = new THREE.ExtrudeGeometry(shape, { depth: inChuteLength, bevelEnabled: false });
      chuteGeom.translate(0, 0.2, -outerRadius - inChuteLength);
      const chuteMesh = new THREE.Mesh(chuteGeom, trackMaterial);
      group.add(chuteMesh);
      colliders.push(createTrimeshCollider(world, chuteMesh, rigidBody));

      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0.2, -outerRadius - inChuteLength),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: new THREE.Vector3(0, -funnelHeight - 0.2, 0),
        localDirection: new THREE.Vector3(0, -1, 0)
      });
      break;
    }

    case 'splitter_paddle': {
      // 1 path entering, split into 2 angled paths left and right
      const inLength = 2.0;
      const outLength = 3.0;

      // Base Y track shape
      const baseGroup = new THREE.Group();

      // Main inlet
      const inShape = new THREE.Shape();
      inShape.moveTo(-TRACK_WIDTH, TRACK_WALL_HEIGHT);
      inShape.lineTo(-TRACK_WIDTH, 0);
      inShape.lineTo(TRACK_WIDTH, 0);
      inShape.lineTo(TRACK_WIDTH, TRACK_WALL_HEIGHT);
      const inGeom = new THREE.ExtrudeGeometry(inShape, { depth: inLength, bevelEnabled: false });
      const inMesh = new THREE.Mesh(inGeom, trackMaterial);
      baseGroup.add(inMesh);

      // Left branch
      const leftGeom = new THREE.ExtrudeGeometry(inShape, { depth: outLength, bevelEnabled: false });
      leftGeom.rotateY(Math.PI / 6);
      leftGeom.translate(-0.5, 0, inLength);
      const leftMesh = new THREE.Mesh(leftGeom, trackMaterial);
      baseGroup.add(leftMesh);

      // Right branch
      const rightGeom = new THREE.ExtrudeGeometry(inShape, { depth: outLength, bevelEnabled: false });
      rightGeom.rotateY(-Math.PI / 6);
      rightGeom.translate(0.5, 0, inLength);
      const rightMesh = new THREE.Mesh(rightGeom, trackMaterial);
      baseGroup.add(rightMesh);

      group.add(baseGroup);
      colliders.push(createTrimeshCollider(world, inMesh, rigidBody));
      colliders.push(createTrimeshCollider(world, leftMesh, rigidBody));
      colliders.push(createTrimeshCollider(world, rightMesh, rigidBody));

      // Physical interactive paddle / flipper in the middle
      const paddleGeom = new THREE.BoxGeometry(0.15, 0.6, 1.2);
      paddleGeom.translate(0, 0.3, 0.6);
      const paddleMesh = new THREE.Mesh(paddleGeom, paddleMaterial);
      paddleMesh.position.set(0, 0, inLength);
      group.add(paddleMesh);

      let paddleAngle = 0.25; // initial angle offset
      let targetAngle = 0.25;

      updateAnimation = (delta: number) => {
        paddleAngle += (targetAngle - paddleAngle) * Math.min(delta * 10, 1.0);
        paddleMesh.rotation.y = paddleAngle;
      };

      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out_left',
        type: 'out',
        localPosition: new THREE.Vector3(-outLength * Math.sin(Math.PI / 6) - 0.5, 0, inLength + outLength * Math.cos(Math.PI / 6)),
        localDirection: new THREE.Vector3(-Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6))
      });
      sockets.push({
        id: 'out_right',
        type: 'out',
        localPosition: new THREE.Vector3(outLength * Math.sin(Math.PI / 6) + 0.5, 0, inLength + outLength * Math.cos(Math.PI / 6)),
        localDirection: new THREE.Vector3(Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6))
      });
      break;
    }

    case 'splitter_dual': {
      // Geometry dual branch splitter without moving paddle (marble splits based on entry velocity/angle)
      const inLength = 2.0;
      const outLength = 3.0;

      const inShape = new THREE.Shape();
      inShape.moveTo(-TRACK_WIDTH, TRACK_WALL_HEIGHT);
      inShape.lineTo(-TRACK_WIDTH, 0);
      inShape.lineTo(TRACK_WIDTH, 0);
      inShape.lineTo(TRACK_WIDTH, TRACK_WALL_HEIGHT);

      const inGeom = new THREE.ExtrudeGeometry(inShape, { depth: inLength, bevelEnabled: false });
      const inMesh = new THREE.Mesh(inGeom, trackMaterial);
      group.add(inMesh);

      const leftGeom = new THREE.ExtrudeGeometry(inShape, { depth: outLength, bevelEnabled: false });
      leftGeom.rotateY(Math.PI / 5);
      leftGeom.translate(-0.4, 0, inLength);
      const leftMesh = new THREE.Mesh(leftGeom, trackMaterial);
      group.add(leftMesh);

      const rightGeom = new THREE.ExtrudeGeometry(inShape, { depth: outLength, bevelEnabled: false });
      rightGeom.rotateY(-Math.PI / 5);
      rightGeom.translate(0.4, 0, inLength);
      const rightMesh = new THREE.Mesh(rightGeom, trackMaterial);
      group.add(rightMesh);

      // Center divider wedge
      const wedgeGeom = new THREE.ConeGeometry(0.3, TRACK_WALL_HEIGHT * 1.2, 3);
      wedgeGeom.rotateX(Math.PI / 2);
      wedgeGeom.translate(0, TRACK_WALL_HEIGHT * 0.5, inLength + 0.5);
      const wedgeMesh = new THREE.Mesh(wedgeGeom, startGateMaterial);
      group.add(wedgeMesh);

      colliders.push(createTrimeshCollider(world, inMesh, rigidBody));
      colliders.push(createTrimeshCollider(world, leftMesh, rigidBody));
      colliders.push(createTrimeshCollider(world, rightMesh, rigidBody));
      colliders.push(createTrimeshCollider(world, wedgeMesh, rigidBody));

      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      sockets.push({
        id: 'out_left',
        type: 'out',
        localPosition: new THREE.Vector3(-outLength * Math.sin(Math.PI / 5) - 0.4, 0, inLength + outLength * Math.cos(Math.PI / 5)),
        localDirection: new THREE.Vector3(-Math.sin(Math.PI / 5), 0, Math.cos(Math.PI / 5))
      });
      sockets.push({
        id: 'out_right',
        type: 'out',
        localPosition: new THREE.Vector3(outLength * Math.sin(Math.PI / 5) + 0.4, 0, inLength + outLength * Math.cos(Math.PI / 5)),
        localDirection: new THREE.Vector3(Math.sin(Math.PI / 5), 0, Math.cos(Math.PI / 5))
      });
      break;
    }

    case 'start_gate': {
      // Wide starting platform with drop-down barrier gate
      const width = TRACK_WIDTH * 4;
      const length = 3.0;

      const floorGeom = new THREE.BoxGeometry(width, TRACK_THICKNESS, length);
      floorGeom.translate(0, -TRACK_THICKNESS / 2, length / 2);
      const floorMesh = new THREE.Mesh(floorGeom, startGateMaterial);
      group.add(floorMesh);

      // Side walls
      const wallL = new THREE.Mesh(new THREE.BoxGeometry(TRACK_THICKNESS, TRACK_WALL_HEIGHT, length), startGateMaterial);
      wallL.position.set(-width / 2, TRACK_WALL_HEIGHT / 2, length / 2);
      const wallR = new THREE.Mesh(new THREE.BoxGeometry(TRACK_THICKNESS, TRACK_WALL_HEIGHT, length), startGateMaterial);
      wallR.position.set(width / 2, TRACK_WALL_HEIGHT / 2, length / 2);
      group.add(wallL, wallR);

      // Start arch banner
      const archL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), startGateMaterial);
      archL.position.set(-width / 2, 1, 1.0);
      const archR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), startGateMaterial);
      archR.position.set(width / 2, 1, 1.0);
      const bannerBar = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.4, 0.1), startGateMaterial);
      bannerBar.position.set(0, 2.0, 1.0);
      group.add(archL, archR, bannerBar);

      // Moveable Gate Bar Physics Collider / Animation
      const gateBarMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width - 0.1, 0.4, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.3 })
      );
      gateBarMesh.position.set(0, 0.25, 1.5);
      group.add(gateBarMesh);

      // Dynamic gate rigid body
      const gateBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(data.position[0], data.position[1] + 0.25, data.position[2] + 1.5);
      const gateBody = world.createRigidBody(gateBodyDesc);
      const gateColliderDesc = RAPIER.ColliderDesc.cuboid((width - 0.1) / 2, 0.2, 0.075);
      const gateCollider = world.createCollider(gateColliderDesc, gateBody);
      colliders.push(gateCollider);

      colliders.push(createTrimeshCollider(world, floorMesh, rigidBody));
      colliders.push(createTrimeshCollider(world, wallL, rigidBody));
      colliders.push(createTrimeshCollider(world, wallR, rigidBody));

      let isOpen = false;
      let gateY = 0.25;

      gateTrigger = () => {
        isOpen = true;
      };

      resetGate = () => {
        isOpen = false;
        gateY = 0.25;
        gateBarMesh.position.y = 0.25;
        gateBody.setNextKinematicTranslation({
          x: data.position[0],
          y: data.position[1] + 0.25,
          z: data.position[2] + 1.5
        });
      };

      updateAnimation = (delta: number) => {
        if (isOpen && gateY > -0.6) {
          gateY -= delta * 3.0;
          gateBarMesh.position.y = gateY;
          gateBody.setNextKinematicTranslation({
            x: data.position[0],
            y: data.position[1] + gateY,
            z: data.position[2] + 1.5
          });
        }
      };

      sockets.push({
        id: 'out',
        type: 'out',
        localPosition: new THREE.Vector3(0, 0, length),
        localDirection: new THREE.Vector3(0, 0, 1)
      });
      break;
    }

    case 'finish_gate': {
      // Finish arch & sensor trigger zone
      const length = 2.0;
      const shape = new THREE.Shape();
      shape.moveTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(-TRACK_WIDTH / 2 - TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, -TRACK_THICKNESS);
      shape.lineTo(TRACK_WIDTH / 2 + TRACK_THICKNESS, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.lineTo(TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, 0);
      shape.lineTo(-TRACK_WIDTH / 2, TRACK_WALL_HEIGHT);
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
      const mesh = new THREE.Mesh(geom, finishGateMaterial);
      group.add(mesh);

      // Finish Arch structure
      const archL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8), finishGateMaterial);
      archL.position.set(-TRACK_WIDTH / 2 - 0.2, 0.9, length / 2);
      const archR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8), finishGateMaterial);
      archR.position.set(TRACK_WIDTH / 2 + 0.2, 0.9, length / 2);

      // Checkerboard banner
      const banner = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH + 0.6, 0.4, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
      );
      banner.position.set(0, 1.8, length / 2);

      group.add(archL, archR, banner);
      colliders.push(createTrimeshCollider(world, mesh, rigidBody));

      sockets.push({
        id: 'in',
        type: 'in',
        localPosition: new THREE.Vector3(0, 0, 0),
        localDirection: new THREE.Vector3(0, 0, -1)
      });
      break;
    }
  }

  return {
    data,
    group,
    sockets,
    rigidBody,
    colliders,
    updateAnimation,
    gateTrigger,
    resetGate
  };
}
