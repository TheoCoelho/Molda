import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type MeshPreparationOptions = {
  /** Remove triângulos com área menor que este limite (em unidades do modelo). */
  minTriangleArea?: number;
  /** Une vértices próximos para eliminar fendas microscópicas. */
  weldTolerance?: number;
  /** Recalcula normais; "smooth" suaviza, "flat" força sombreamento plano. */
  recomputeNormals?: "smooth" | "flat" | false;
  /** Evita tocar em SkinnedMesh por padrão (para não corromper pesos). */
  processSkinned?: boolean;
  /** Exibe métricas detalhadas no console. */
  debug?: boolean;
};

export type MeshPreparationMeshReport = {
  id: number;
  name: string;
  isSkinned: boolean;
  verticesBefore: number;
  verticesAfter: number;
  trianglesBefore: number;
  trianglesAfter: number;
  removedTriangles: number;
  weldedVertices: number;
};

export type MeshPreparationReport = {
  meshes: MeshPreparationMeshReport[];
  totalMeshes: number;
  totalVerticesBefore: number;
  totalVerticesAfter: number;
  totalTrianglesBefore: number;
  totalTrianglesAfter: number;
  totalRemovedTriangles: number;
  totalWeldedVertices: number;
};

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpAB = new THREE.Vector3();
const tmpAC = new THREE.Vector3();

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const position = geometry.getAttribute("position");
  return position ? position.count / 3 : 0;
}

function vertexCount(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  return position ? position.count : 0;
}

function stripSmallTriangles(
  geometry: THREE.BufferGeometry,
  minArea: number
): { geometry: THREE.BufferGeometry; removed: number } {
  if (minArea <= 0) return { geometry, removed: 0 };
  // Se houver morph targets, evitar manipular (processo bem mais complexo)
  if (Object.keys(geometry.morphAttributes).length) return { geometry, removed: 0 };

  const nonIndexed = geometry.toNonIndexed();
  const position = nonIndexed.getAttribute("position");
  if (!position) return { geometry, removed: 0 };

  const attributeNames = Object.keys(nonIndexed.attributes);
  const accum: Record<string, number[]> = {};
  for (const name of attributeNames) accum[name] = [];

  let removed = 0;
  const count = position.count;
  for (let i = 0; i < count; i += 3) {
    tmpA.fromBufferAttribute(position, i + 0);
    tmpB.fromBufferAttribute(position, i + 1);
    tmpC.fromBufferAttribute(position, i + 2);

    tmpAB.subVectors(tmpB, tmpA);
    tmpAC.subVectors(tmpC, tmpA);
    const area = tmpAB.cross(tmpAC).length() * 0.5;

    if (area >= minArea) {
      for (const name of attributeNames) {
        const attr = nonIndexed.getAttribute(name) as THREE.BufferAttribute;
        const array = accum[name];
        const itemSize = attr.itemSize;
        const src = attr.array as ArrayLike<number>;
        for (let corner = 0; corner < 3; corner++) {
          const base = (i + corner) * itemSize;
          for (let k = 0; k < itemSize; k++) {
            array.push(src[base + k]);
          }
        }
      }
    } else {
      removed += 1;
    }
  }

  if (!removed) {
    nonIndexed.dispose();
    return { geometry, removed: 0 };
  }

  const filtered = new THREE.BufferGeometry();
  for (const name of attributeNames) {
    const attr = nonIndexed.getAttribute(name) as THREE.BufferAttribute;
    const array = accum[name];
    const Constructor = attr.array.constructor as { new(length: number): ArrayLike<number> & { set?: (src: ArrayLike<number>) => void } };
    const typed = new Constructor(array.length);
    if (typeof (typed as any).set === "function") {
      (typed as any).set(array);
    } else {
      for (let i = 0; i < array.length; i++) (typed as any)[i] = array[i];
    }
    filtered.setAttribute(name, new THREE.BufferAttribute(typed as any, attr.itemSize, attr.normalized));
  }

  nonIndexed.dispose();
  return { geometry: filtered, removed };
}

function applyFlatNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

export function prepareMeshForDecals(
  root: THREE.Object3D,
  opts: MeshPreparationOptions = {}
): MeshPreparationReport {
  const options: Required<MeshPreparationOptions> = {
    minTriangleArea: opts.minTriangleArea ?? 1e-8,
    weldTolerance: opts.weldTolerance ?? 1e-4,
    recomputeNormals: opts.recomputeNormals ?? "smooth",
    processSkinned: opts.processSkinned ?? false,
    debug: opts.debug ?? false,
  };

  const meshes: MeshPreparationMeshReport[] = [];
  const seenGeometries = new Set<THREE.BufferGeometry>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;

    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    if (isSkinned && !options.processSkinned) {
      meshes.push({
        id: mesh.id,
        name: mesh.name || mesh.id.toString(),
        isSkinned,
        verticesBefore: vertexCount(mesh.geometry),
        verticesAfter: vertexCount(mesh.geometry),
        trianglesBefore: triangleCount(mesh.geometry),
        trianglesAfter: triangleCount(mesh.geometry),
        removedTriangles: 0,
        weldedVertices: 0,
      });
      return;
    }

    let geometry = mesh.geometry;
    if (seenGeometries.has(geometry)) {
      geometry = geometry.clone();
      mesh.geometry = geometry;
    }
    seenGeometries.add(geometry);

    const initialVertices = vertexCount(geometry);
    const initialTriangles = triangleCount(geometry);

    let current = geometry.clone();
    mesh.geometry = current;

    const replaceGeometry = (next: THREE.BufferGeometry) => {
      if (next === current) return;
      mesh.geometry = next;
      current.dispose();
      current = next;
    };

    let removedTriangles = 0;
    let weldedVertices = 0;

    if (options.minTriangleArea > 0) {
      const result = stripSmallTriangles(current, options.minTriangleArea);
      removedTriangles += result.removed;
      replaceGeometry(result.geometry);
    }

    if (options.weldTolerance > 0) {
      const before = vertexCount(current);
      const merged = mergeVertices(current, options.weldTolerance);
      weldedVertices = before - vertexCount(merged);
      replaceGeometry(merged);
    }

    if (options.recomputeNormals === "smooth") {
      current.computeVertexNormals();
    } else if (options.recomputeNormals === "flat") {
      const flat = applyFlatNormals(current);
      replaceGeometry(flat);
    }

    current.computeBoundingBox();
    current.computeBoundingSphere();

    const report: MeshPreparationMeshReport = {
      id: mesh.id,
      name: mesh.name || mesh.id.toString(),
      isSkinned,
      verticesBefore: initialVertices,
      verticesAfter: vertexCount(current),
      trianglesBefore: initialTriangles,
      trianglesAfter: triangleCount(current),
      removedTriangles,
      weldedVertices,
    };
    meshes.push(report);

    if (options.debug) {
      // eslint-disable-next-line no-console
      console.debug("[MeshPreparation]", report);
    }
  });

  const summary: MeshPreparationReport = {
    meshes,
    totalMeshes: meshes.length,
    totalVerticesBefore: meshes.reduce((acc, m) => acc + m.verticesBefore, 0),
    totalVerticesAfter: meshes.reduce((acc, m) => acc + m.verticesAfter, 0),
    totalTrianglesBefore: meshes.reduce((acc, m) => acc + m.trianglesBefore, 0),
    totalTrianglesAfter: meshes.reduce((acc, m) => acc + m.trianglesAfter, 0),
    totalRemovedTriangles: meshes.reduce((acc, m) => acc + m.removedTriangles, 0),
    totalWeldedVertices: meshes.reduce((acc, m) => acc + m.weldedVertices, 0),
  };

  if (options.debug) {
    // eslint-disable-next-line no-console
    console.debug("[MeshPreparation] summary", summary);
  }

  return summary;
}
