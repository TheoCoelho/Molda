import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";

export type DecalSize = { width: number; height: number; depth?: number };

type DecalOptions = {
  /** Limite angular entre a normal local do decal e o eixo de projeção (+Y local). Mais alto = mais permissivo */
  angleClampDeg?: number; // 75–88 recomendado
  /** Profundidade do decal como fração do maior lado do decal (rasa evita “wrap” em quinas) */
  depthFromSizeScale?: number; // 0.15–0.30 recomendado
  /** Borda suave opcional (apenas se usar shader). Mantido OFF por padrão para máxima estabilidade. */
  useFeather?: boolean;
  feather?: number; // 0.06–0.12 se useFeather=true
};

export class DecalPlacer {
  private texturePromise: Promise<THREE.Texture>;
  private opts: Required<DecalOptions>;

  constructor(
    private scene: THREE.Scene,
    logoUrl = "/assets/logo.png",
    opts: DecalOptions = {}
  ) {
    const loader = new THREE.TextureLoader();
    this.texturePromise = loader.loadAsync(logoUrl).then((tex) => {
      if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
      else (tex as any).encoding = THREE.sRGBEncoding;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    });

    this.opts = {
      angleClampDeg: opts.angleClampDeg ?? 82,
      depthFromSizeScale: opts.depthFromSizeScale ?? 0.2,
      useFeather: opts.useFeather ?? false, // desativado por padrão
      feather: opts.feather ?? 0.08,
    };
  }

  private async getTexture() {
    return this.texturePromise;
  }

  /** Mantém a orientação original: +Y -> normal da superfície */
  private computeOrientation(normal: THREE.Vector3) {
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(
      up,
      normal.clone().normalize()
    );
    return new THREE.Euler().setFromQuaternion(q, "XYZ");
  }

  /** Profundidade rasa baseada no tamanho do decal (reduz “wrap” e distorção) */
  private calcRasaDepthFromSize(size: DecalSize) {
    const major = Math.max(size.width, size.height);
    const d = major * this.opts.depthFromSizeScale;
    return Math.max(1e-3, d);
  }

  /** Material básico estável (padrão) */
  private async makeBasicMaterial() {
    const texture = await this.getTexture();
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    });
  }

  /** Material com borda suave (opcional, só ligue se quiser acabamento extra) */
  private async makeFeatherMaterial() {
    const texture = await this.getTexture();
    const feather = this.opts.feather;
    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        feather: { value: feather },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float feather;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(map, vUv);
          float d = distance(vUv, vec2(0.5));
          float inner = 0.5 - feather;
          float alphaMask = 1.0 - smoothstep(inner, 0.5, d);
          gl_FragColor = vec4(tex.rgb, tex.a * alphaMask);
        }
      `,
      transparent: true,
      depthTest: true,     // mantém pipeline estável
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      toneMapped: true,
    });
  }

  private async makeMaterial() {
    return this.opts.useFeather
      ? this.makeFeatherMaterial()
      : this.makeBasicMaterial();
  }

  /** Cria DecalGeometry com profundidade rasa e orientação +Y->normal */
  private buildRawGeometry(
    target: THREE.Mesh,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    size: DecalSize
  ) {
    const depth = this.calcRasaDepthFromSize(size);
    const euler = this.computeOrientation(normal);
    const geom = new DecalGeometry(
      target,
      point,
      euler,
      new THREE.Vector3(size.width, size.height, depth)
    );
    return geom as THREE.BufferGeometry;
  }

  /**
   * Filtra triângulos do decal cujo plano “vira a esquina”.
   * Se filtrar demais (ou tudo), volta a geometria original (fallback).
   */
  private filterByAngleWithFallback(
    geom: THREE.BufferGeometry,
    maxDeg: number
  ) {
    const idx = geom.getIndex();
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    if (!idx || !pos) return geom;

    const indices = idx.array as any;
    const keep: number[] = [];
    const maxCos = Math.cos(THREE.MathUtils.degToRad(maxDeg));

    // No espaço local do DecalGeometry, +Y é o eixo de projeção (porque orientamos assim).
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    const ab = new THREE.Vector3(),
      ac = new THREE.Vector3(),
      n = new THREE.Vector3();

    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3,
        ib = indices[i + 1] * 3,
        ic = indices[i + 2] * 3;
      a.set(pos.array[ia], pos.array[ia + 1], pos.array[ia + 2]);
      b.set(pos.array[ib], pos.array[ib + 1], pos.array[ib + 2]);
      c.set(pos.array[ic], pos.array[ic + 1], pos.array[ic + 2]);

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      n.crossVectors(ab, ac).normalize();

      // Queremos faces cujo normal aponta "mais ou menos" para +Y local (n.y alto)
      if (Math.abs(n.y) >= maxCos) {
        keep.push(indices[i], indices[i + 1], indices[i + 2]);
      }
    }

    if (keep.length < 3) {
      // Fallback: nada a filtrar (mantém geom para garantir exibição)
      return geom;
    }

    const out = geom.clone();
    const IndexArray =
      (pos.count > 65535 ? Uint32Array : Uint16Array) as any;
    out.setIndex(new IndexArray(keep));
    out.computeVertexNormals();
    return out;
  }

  private finalizeDecalMesh(mesh: THREE.Mesh) {
    mesh.renderOrder = 999;
    (mesh as any).isDecal = true;
  }

  // ----------------- API pública -----------------

  async place(
    target: THREE.Mesh,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    size: DecalSize
  ) {
    const mat = await this.makeMaterial();
    const raw = this.buildRawGeometry(target, point, normal, size);
    const filtered = this.filterByAngleWithFallback(
      raw,
      this.opts.angleClampDeg
    );

    const decalMesh = new THREE.Mesh(filtered, mat);
    this.finalizeDecalMesh(decalMesh);
    this.scene.add(decalMesh);
    return decalMesh;
  }

  async update(
    existing: THREE.Mesh,
    target: THREE.Mesh,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    size: DecalSize
  ) {
    const raw = this.buildRawGeometry(target, point, normal, size);
    const filtered = this.filterByAngleWithFallback(
      raw,
      this.opts.angleClampDeg
    );
    const old = existing.geometry as THREE.BufferGeometry;
    existing.geometry = filtered;
    old.dispose();
    this.finalizeDecalMesh(existing);
  }
}

export default DecalPlacer;
