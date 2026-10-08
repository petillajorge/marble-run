import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TrackPieceData, TrackPieceType, TrackSocket, PlacedTrackPiece } from './types';
import { createTrackPiece } from './trackPiece';

export class TrackBuilder {
  public scene: THREE.Scene;
  public world: RAPIER.World;
  public placedPieces: Map<string, PlacedTrackPiece> = new Map();
  public connectorVisualizers: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
  }

  // Add piece to scenario
  public addPiece(type: TrackPieceType, position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0]): PlacedTrackPiece {
    const id = 'piece_' + Math.random().toString(36).substring(2, 9);
    const data: TrackPieceData = { id, type, position, rotation };

    // Snap to open socket if nearby
    const bestSnap = this.findBestSnapTarget(type, position);
    if (bestSnap) {
      data.position = bestSnap.position;
      data.rotation = bestSnap.rotation;
    }

    const piece = createTrackPiece(data, this.world);
    this.scene.add(piece.group);
    this.placedPieces.set(id, piece);
    this.updateConnections();
    this.renderSocketVisualizers();
    return piece;
  }

  // Find socket snapping target
  public findBestSnapTarget(
    type: TrackPieceType,
    candidatePos: [number, number, number],
    ignorePieceId?: string
  ): { position: [number, number, number]; rotation: [number, number, number] } | null {
    const SNAP_RADIUS = 2.5;
    let closestDist = SNAP_RADIUS;
    let bestSnap: { position: [number, number, number]; rotation: [number, number, number] } | null = null;

    const candVec = new THREE.Vector3(...candidatePos);

    // Get candidate's default input socket transform in local space
    const tempPiece = createTrackPiece({ id: 'temp', type, position: [0, 0, 0], rotation: [0, 0, 0] }, this.world);
    const inSocket = tempPiece.sockets.find(s => s.type === 'in');

    // Clean up temp piece rigid bodies from world
    if (tempPiece.rigidBody) this.world.removeRigidBody(tempPiece.rigidBody);
    tempPiece.colliders.forEach(c => this.world.removeCollider(c, true));

    if (!inSocket) return null;

    for (const [pieceId, piece] of this.placedPieces.entries()) {
      if (pieceId === ignorePieceId) continue;

      const pieceMatrix = piece.group.matrixWorld;

      for (const socket of piece.sockets) {
        if (socket.type !== 'out') continue; // Snap 'in' of new piece to 'out' of existing piece

        const worldSocketPos = socket.localPosition.clone().applyMatrix4(pieceMatrix);
        const dist = candVec.distanceTo(worldSocketPos);

        if (dist < closestDist) {
          closestDist = dist;

          // Align new piece 'in' socket with target 'out' socket
          // Target forward direction in world space
          const worldSocketDir = socket.localDirection.clone().transformDirection(pieceMatrix).normalize();

          // Calculate required orientation
          // In socket has default direction (0, 0, -1). Out socket points forward.
          // We want new piece forward vector to align with worldSocketDir
          const targetRot = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            worldSocketDir
          );

          const euler = new THREE.Euler().setFromQuaternion(targetRot, 'YXZ');

          // Position calculated so that inSocket lands exactly on worldSocketPos
          const inOffset = inSocket.localPosition.clone().applyQuaternion(targetRot);
          const finalPos = worldSocketPos.clone().sub(inOffset);

          bestSnap = {
            position: [finalPos.x, finalPos.y, finalPos.z],
            rotation: [euler.x, euler.y, euler.z]
          };
        }
      }
    }

    return bestSnap;
  }

  // Move existing piece & snap if near sockets
  public movePiece(pieceId: string, position: [number, number, number], rotation?: [number, number, number]) {
    const piece = this.placedPieces.get(pieceId);
    if (!piece) return;

    let targetPos = position;
    let targetRot = rotation || piece.data.rotation;

    const bestSnap = this.findBestSnapTarget(piece.data.type, position, pieceId);
    if (bestSnap) {
      targetPos = bestSnap.position;
      targetRot = bestSnap.rotation;
    }

    piece.data.position = targetPos;
    piece.data.rotation = targetRot;

    piece.group.position.set(...targetPos);
    piece.group.rotation.set(...targetRot);

    if (piece.rigidBody) {
      piece.rigidBody.setTranslation({ x: targetPos[0], y: targetPos[1], z: targetPos[2] }, true);
      piece.rigidBody.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...targetRot)), true);
    }

    this.updateConnections();
    this.renderSocketVisualizers();
  }

  // Rotate piece around Y axis by angle in radians
  public rotatePiece(pieceId: string, angleDeltaRad: number) {
    const piece = this.placedPieces.get(pieceId);
    if (!piece) return;

    const newRot: [number, number, number] = [
      piece.data.rotation[0],
      piece.data.rotation[1] + angleDeltaRad,
      piece.data.rotation[2]
    ];

    this.movePiece(pieceId, piece.data.position, newRot);
  }

  // Delete piece
  public removePiece(pieceId: string) {
    const piece = this.placedPieces.get(pieceId);
    if (!piece) return;

    this.scene.remove(piece.group);
    if (piece.rigidBody) {
      this.world.removeRigidBody(piece.rigidBody);
    }
    piece.colliders.forEach(c => this.world.removeCollider(c, true));

    this.placedPieces.delete(pieceId);
    this.updateConnections();
    this.renderSocketVisualizers();
  }

  // Update connection links
  private updateConnections() {
    // Reset socket connections
    for (const piece of this.placedPieces.values()) {
      piece.sockets.forEach(s => {
        delete s.connectedPieceId;
        delete s.connectedSocketId;
      });
    }

    // Connect matching sockets
    const pieces = Array.from(this.placedPieces.values());
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const p1 = pieces[i];
        const p2 = pieces[j];

        for (const s1 of p1.sockets) {
          const w1 = s1.localPosition.clone().applyMatrix4(p1.group.matrixWorld);

          for (const s2 of p2.sockets) {
            if (s1.type === s2.type) continue; // Only connect 'in' to 'out'
            const w2 = s2.localPosition.clone().applyMatrix4(p2.group.matrixWorld);

            if (w1.distanceTo(w2) < 0.2) {
              s1.connectedPieceId = p2.data.id;
              s1.connectedSocketId = s2.id;
              s2.connectedPieceId = p1.data.id;
              s2.connectedSocketId = s1.id;
            }
          }
        }
      }
    }
  }

  // Render open socket indicators
  public renderSocketVisualizers() {
    // Remove existing socket visualizers
    this.connectorVisualizers.forEach(v => this.scene.remove(v));
    this.connectorVisualizers = [];

    const sphereGeom = new THREE.SphereGeometry(0.2, 12, 12);
    const openMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });

    for (const piece of this.placedPieces.values()) {
      for (const socket of piece.sockets) {
        if (!socket.connectedPieceId) {
          const worldPos = socket.localPosition.clone().applyMatrix4(piece.group.matrixWorld);
          const sphere = new THREE.Mesh(sphereGeom, openMat);
          sphere.position.copy(worldPos);
          this.scene.add(sphere);
          this.connectorVisualizers.push(sphere);
        }
      }
    }
  }

  // Clear track
  public clearTrack() {
    Array.from(this.placedPieces.keys()).forEach(id => this.removePiece(id));
  }

  // Serialize to JSON
  public serializeTrack(): TrackPieceData[] {
    return Array.from(this.placedPieces.values()).map(p => p.data);
  }

  // Load track from JSON data
  public loadTrack(data: TrackPieceData[]) {
    this.clearTrack();
    data.forEach(item => {
      this.addPiece(item.type, item.position, item.rotation);
    });
  }

  // Find start gate position & orientation for marble spawning
  public getStartGateSpawnPoints(count: number = 5): THREE.Vector3[] {
    const startPieces = Array.from(this.placedPieces.values()).filter(p => p.data.type === 'start_gate');
    const points: THREE.Vector3[] = [];

    if (startPieces.length === 0) {
      // Default spawn point if no start gate is present
      for (let i = 0; i < count; i++) {
        points.push(new THREE.Vector3((i - count / 2) * 0.6, 2.0, 0));
      }
      return points;
    }

    const startGate = startPieces[0];
    const matrix = startGate.group.matrixWorld;
    const width = 1.2 * 3;

    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * (width / count);
      const localSpawn = new THREE.Vector3(offsetX, 0.4, 0.5);
      const worldSpawn = localSpawn.applyMatrix4(matrix);
      points.push(worldSpawn);
    }

    return points;
  }
}
