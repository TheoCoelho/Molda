import * as THREE from "three";

/**
 * ProjectedTextureDecal: projeta uma textura sobre um objeto 3D usando shader.
 * A imagem permanece inteira e contínua, adaptando-se às curvaturas do objeto
 * sem ser cortada por faces individuais.
 */
export type ProjectedTextureOptions = {
  /** Profundidade da projeção (quanto maior, mais profundo penetra no objeto) */
  depth?: number;
  /** Opacidade do decal */
  opacity?: number;
  /** Borda suave (feather) */
  feather?: number;
  /** Limite minimo para alinhamento da normal (permite liberar backfaces quando negativo) */
  minFacing?: number;
};

export default class ProjectedTextureDecal {
  public mesh: THREE.Mesh | null = null;
  private texture: THREE.Texture;
  private opts: Required<ProjectedTextureOptions>;
  private targetMesh: THREE.Mesh | null = null;
  private originalMaterial: THREE.Material | THREE.Material[] | null = null;
  private decalMaterial: THREE.ShaderMaterial | null = null;

  constructor(texture: THREE.Texture, opts: ProjectedTextureOptions = {}) {
    this.texture = texture;
    this.prepareTexture(texture);
    this.opts = {
      depth: opts.depth ?? 10,
      opacity: opts.opacity ?? 1.0,
      feather: opts.feather ?? 0.05, // Feather suave nas bordas (efeito adesivo)
      minFacing: opts.minFacing ?? 0.3, // Apenas faces bem alinhadas (evita distorção)
    };
  }

  private prepareTexture(tex: THREE.Texture) {
    if ("colorSpace" in tex) {
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
    }
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }

  private createProjectionMaterial(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
    angleRad: number
  ): THREE.ShaderMaterial {
    // Cria uma matriz de projeção para o decal
    const projectorMatrix = new THREE.Matrix4();
    const projectorMatrixInverse = new THREE.Matrix4();

    // Orientação do projetor
    const forward = normal.clone().normalize();
    const upRef = Math.abs(forward.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(upRef, forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();

    // Aplica rotação em torno do eixo forward
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const rotatedRight = right.clone().multiplyScalar(cos).add(up.clone().multiplyScalar(sin));
    const rotatedUp = up.clone().multiplyScalar(cos).sub(right.clone().multiplyScalar(sin));

    // Matriz de transformação do projetor
    projectorMatrix.makeBasis(rotatedRight, rotatedUp, forward);
    projectorMatrix.setPosition(position);
    projectorMatrixInverse.copy(projectorMatrix).invert();

    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
        projectorMatrixInverse: { value: projectorMatrixInverse },
        projectorPosition: { value: position.clone() },
        projectorNormal: { value: forward.clone() },
        decalWidth: { value: width },
        decalHeight: { value: height },
        decalDepth: { value: this.opts.depth },
        opacity: { value: this.opts.opacity },
        feather: { value: this.opts.feather },
        minFacing: { value: this.opts.minFacing },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform mat4 projectorMatrixInverse;
        uniform vec3 projectorPosition;
        uniform vec3 projectorNormal;
        uniform float decalWidth;
        uniform float decalHeight;
        uniform float decalDepth;
        uniform float opacity;
        uniform float feather;
        uniform float minFacing;
        
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        
        void main() {
          // Transforma a posição do mundo para o espaço do projetor
          vec4 localPos = projectorMatrixInverse * vec4(vWorldPosition, 1.0);
          
          // Calcula UV baseado na posição no espaço do projetor
          vec2 uv = vec2(
            (localPos.x / decalWidth) + 0.5,
            (localPos.y / decalHeight) + 0.5
          );
          
          // Verifica se está dentro dos limites do decal
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            discard;
          }
          
          // Verifica profundidade (corte mais abrupto para evitar distorção)
          float depth = abs(localPos.z);
          if (depth > decalDepth * 0.6) {
            discard;
          }
          
          // Verifica se a normal está voltada para o projetor
          float facing = dot(vWorldNormal, projectorNormal);
          if (facing < minFacing) {
            discard;
          }
          
          // Amostra a textura
          vec4 texColor = texture2D(map, uv);
          
          // Aplica feather nas bordas
          float edgeX = min(uv.x, 1.0 - uv.x);
          float edgeY = min(uv.y, 1.0 - uv.y);
          float edge = min(edgeX, edgeY);
          float alpha = smoothstep(0.0, feather, edge);
          
          // Fade baseado na profundidade (mais abrupto para manter formato)
          float depthFade = 1.0 - smoothstep(decalDepth * 0.4, decalDepth * 0.6, depth);
          
          gl_FragColor = vec4(texColor.rgb, texColor.a * alpha * depthFade * opacity);
        }
      `,
      transparent: true,
      side: THREE.FrontSide, // Renderiza apenas o lado voltado para a câmera do projetor
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
  }

  build(
    target: THREE.Mesh,
    position: THREE.Vector3,
    normal: THREE.Vector3,
    size: { width: number; height: number; depth?: number },
    angleRad = 0
  ): THREE.Mesh {
    this.targetMesh = target;
    
    // Salva material original
    if (!this.originalMaterial) {
      this.originalMaterial = target.material;
    }

    const width = size.width;
    const height = size.height;
    const depth = size.depth ?? this.opts.depth;
    this.opts.depth = depth;

    // Cria o material de projeção
    this.decalMaterial = this.createProjectionMaterial(position, normal, width, height, angleRad);

    // Clona a geometria do target para criar mesh que segue os contornos
    // Mantém os vértices em espaço LOCAL (como original)
    const decalGeometry = target.geometry.clone();
    this.mesh = new THREE.Mesh(decalGeometry, this.decalMaterial);
    this.mesh.renderOrder = 999;
    this.mesh.visible = true;
    
    // IMPORTANTE: Copia a matriz world completa do target
    // Isso garante alinhamento PERFEITO, contabilizando transformações de pais
    // O shader receberá vWorldPosition correto através da matrixWorld do mesh
    this.mesh.matrix.copy(target.matrixWorld);
    this.mesh.matrixAutoUpdate = false;
  }

  setTexture(tex: THREE.Texture) {
    this.texture = tex;
    this.prepareTexture(tex);
    if (this.decalMaterial) {
      this.decalMaterial.uniforms.map.value = tex;
      this.decalMaterial.needsUpdate = true;
    }
  }

  dispose() {
    if (this.mesh) {
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      if (this.decalMaterial) {
        this.decalMaterial.dispose();
      }
      this.mesh = null;
    }
    this.decalMaterial = null;
    this.targetMesh = null;
    this.originalMaterial = null;
  }
}
