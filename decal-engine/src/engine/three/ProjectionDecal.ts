// src/engine/three/ProjectionDecal.ts
import * as THREE from "three";

export type ProjectionOptions = {
  /** 0..0.5 – só usado se useFeather=true */
  feather?: number;
  /** liga/desliga recorte retangular em UV [0,1] */
  clipRect?: boolean;
  /** liga/desliga recorte por profundidade (Y local 0..1) */
  clipDepth?: boolean;
  /** liga/desliga clamp por ângulo */
  useAngleClamp?: boolean;
  /** limite do clamp, em graus (se useAngleClamp=true) */
  angleClampDeg?: number;
  /** intensidade do decal (0..1) */
  strength?: number;
  /** evita projetar para trás da malha */
  frontOnly?: boolean;
  /** borda suave (só se useFeather=true) */
  useFeather?: boolean;
};

export default class ProjectionDecal {
  private texture: THREE.Texture;
  private projector: THREE.Object3D;

  // uniforms compartilhados
  private uniforms = {
    uProjTex:   { value: null as unknown as THREE.Texture },
    uProjMat:   { value: new THREE.Matrix4() },        // world -> projector
    uProjDirW:  { value: new THREE.Vector3(0, 1, 0) }, // +Y do projector em mundo
    uFeather:   { value: 0.08 },
    uStrength:  { value: 1.0 },
    uCosLimit:  { value: Math.cos(THREE.MathUtils.degToRad(84)) },
    uClipRect:  { value: 0.0 },  // 1 = recorta UV em [0,1]
    uClipDepth: { value: 0.0 },  // 1 = recorta Y local em [0,1]
    uUseClamp:  { value: 0.0 },  // 1 = usa clamp angular
    uFrontOnly: { value: 1.0 },  // 1 = não projeta para trás
    uUseFeather:{ value: 0.0 },  // 1 = aplica feather circular
  };

  private _attached: THREE.Mesh[] = [];

  constructor(texture: THREE.Texture, opts?: ProjectionOptions) {
    this.texture = texture;
    // ajustes seguros
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    if ("colorSpace" in this.texture) (this.texture as any).colorSpace = (THREE as any).SRGBColorSpace;

    this.projector = new THREE.Object3D();
    this.projector.name = "ProjectionDecalProjector";

    // defaults: sem cortes e sem clamp (MOSTRAR INTEIRO)
    this.uniforms.uProjTex.value = this.texture;
    this.uniforms.uFeather.value = opts?.feather ?? 0.16; // feather maior por padrão
    this.uniforms.uStrength.value = opts?.strength ?? 1.0;
    this.uniforms.uCosLimit.value = Math.cos(
      THREE.MathUtils.degToRad(opts?.angleClampDeg ?? 84)
    );
    this.uniforms.uClipRect.value  = opts?.clipRect   ? 1.0 : 0.0;
    this.uniforms.uClipDepth.value = opts?.clipDepth  ? 1.0 : 0.0;
    this.uniforms.uUseClamp.value  = opts?.useAngleClamp ? 1.0 : 0.0;
    this.uniforms.uFrontOnly.value = opts?.frontOnly === false ? 0.0 : 1.0;
    this.uniforms.uUseFeather.value= opts?.useFeather ?? true ? 1.0 : 0.0; // feather ativado por padrão

    this.updateUniformMatrix();
    this.updateProjDirWorld();
  }

  get object(): THREE.Object3D {
    return this.projector;
  }

  /**
   * Define posição/orientação/escala do projetor. (+Y projeta)
   * @param position posição do centro do decal em MUNDO
   * @param normal   normal da superfície (direção de projeção)
   * @param width    largura do decal (eixo X local do projetor)
   * @param height   altura do decal (eixo Z local do projetor)
   * @param depth    profundidade do volume do projetor (eixo Y local)
   * @param angleRad rotação no PLANO do decal (em torno do +Y local)
   */
  setTransform(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    width: number,
    height: number,
  depth = Math.max(width, height) * 3.0, // PROFUNDIDADE ainda maior para cobrir curvas
    angleRad = 0
  ) {
    // 1) alinha +Y do projetor com a normal do ponto
    const up = new THREE.Vector3(0, 1, 0);
    const qAlign = new THREE.Quaternion().setFromUnitVectors(
      up,
      normal.clone().normalize()
    );

    // 2) aplica rotação NO PLANO do decal (em torno do +Y local do projetor)
    //    multiplicamos DEPOIS de alinhar para girar no espaço local do projetor
    const qRot = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), // eixo Y do projetor
      angleRad
    );
    const qFinal = qAlign.multiply(qRot);

    // 3) escreve TRS
    this.projector.position.copy(position);
    this.projector.quaternion.copy(qFinal);
    // X = u, Y = profundidade, Z = v (mantém sua convenção original)
    this.projector.scale.set(width, depth, height);

    this.projector.updateMatrixWorld(true);
    this.updateUniformMatrix();
    this.updateProjDirWorld();
  }

  attachTo(target: THREE.Object3D) {
    target.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        this.patchMaterial(mesh);
        this._attached.push(mesh);
      }
    });
  }

  detachAll() {
    for (const m of this._attached) this.restoreMaterial(m);
    this._attached.length = 0;
  }

  update() {
    this.updateUniformMatrix();
    this.updateProjDirWorld();
  }

  // ---- internos ----
  private updateUniformMatrix() {
    const inv = new THREE.Matrix4();
    inv.copy(this.projector.matrixWorld).invert();
    this.uniforms.uProjMat.value.copy(inv);
  }
  private updateProjDirWorld() {
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(
      this.projector.getWorldQuaternion(new THREE.Quaternion())
    ).normalize();
    this.uniforms.uProjDirW.value.copy(dir);
  }

  private patchMaterial(mesh: THREE.Mesh) {
    const apply = (mat: THREE.Material) => {
      const tag = "__projection_decal_patched";
      const mm = mat as THREE.Material & { [tag]?: boolean; _origOBC?: any };
      if (mm[tag]) return;
      mm[tag] = true;

      mat.transparent = true;

      const orig = mat.onBeforeCompile.bind(mat);
      mm._origOBC = orig;

      mat.onBeforeCompile = (shader: THREE.Shader) => {
        orig(shader);

        shader.uniforms.uProjTex   = this.uniforms.uProjTex;
        shader.uniforms.uProjMat   = this.uniforms.uProjMat;
        shader.uniforms.uProjDirW  = this.uniforms.uProjDirW;
        shader.uniforms.uFeather   = this.uniforms.uFeather;
        shader.uniforms.uStrength  = this.uniforms.uStrength;
        shader.uniforms.uCosLimit  = this.uniforms.uCosLimit;
        shader.uniforms.uClipRect  = this.uniforms.uClipRect;
        shader.uniforms.uClipDepth = this.uniforms.uClipDepth;
        shader.uniforms.uUseClamp  = this.uniforms.uUseClamp;
        shader.uniforms.uFrontOnly = this.uniforms.uFrontOnly;
        shader.uniforms.uUseFeather= this.uniforms.uUseFeather;

        // vertex: world pos/normal
        shader.vertexShader = shader.vertexShader
          .replace(
            "void main() {",
            `
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
            `
          )
          .replace(
            "#include <project_vertex>",
            `
            #include <project_vertex>
            vWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            `
          );

        // fragment: projeção + blend (sem cortes por padrão)
        if (!shader.fragmentShader.includes("/*__projection_decal__*/")) {
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "void main() {",
              `
              /*__projection_decal__*/
              uniform sampler2D uProjTex;
              uniform mat4      uProjMat;
              uniform vec3      uProjDirW;
              uniform float     uFeather;
              uniform float     uStrength;
              uniform float     uCosLimit;
              uniform float     uClipRect;
              uniform float     uClipDepth;
              uniform float     uUseClamp;
              uniform float     uFrontOnly;

              uniform float     uUseFeather;
              varying vec3      vWorldPos;
              varying vec3      vWorldNormal;
              void main() {
              `
            )
            .replace(
              "#include <dithering_fragment>",
              `
              vec4 p4 = uProjMat * vec4(vWorldPos, 1.0);
              vec3 p  = p4.xyz;     // x,z = plano; y = profundidade

              // uv do projetor
              vec2 uvp = p.xz * 0.5 + 0.5;

              // máscaras (podem ser desligadas)
              float rectMask = mix(1.0,
                                   smoothstep(0.0, 0.05, uvp.x) * smoothstep(1.0, 0.95, uvp.x) *
                                   smoothstep(0.0, 0.05, uvp.y) * smoothstep(1.0, 0.95, uvp.y),
                                   uClipRect);

              float depthMask = mix(1.0,
                                    smoothstep(0.0, 0.05, p.y) * smoothstep(1.0, 0.95, p.y),
                                    uClipDepth);

              // clamp angular opcional
              float angMask = mix(1.0,
                                  step(uCosLimit, abs(dot(normalize(vWorldNormal), normalize(uProjDirW)))),
                                  uUseClamp);

              // opcional: evitar projetar para trás (lado oposto)
              float frontMask = mix(1.0,
                                    step(0.0, dot(normalize(vWorldNormal), normalize(uProjDirW))),
                                    uFrontOnly);

              vec4 decal = texture2D(uProjTex, uvp);

              // feather circular opcional (para acabamento)
              float circle = 1.0;
              if (uUseFeather > 0.5) {
                float d = distance(uvp, vec2(0.5));
                circle = 1.0 - smoothstep(0.5 - uFeather, 0.5, d);
              }

              float mask = rectMask * depthMask * angMask * frontMask * circle;

              #include <dithering_fragment>
              gl_FragColor.rgb = mix(gl_FragColor.rgb, decal.rgb, decal.a * mask * uStrength);
              gl_FragColor.a   = max(gl_FragColor.a,   decal.a * mask * uStrength);
              `
            );
        }
      };

      mat.needsUpdate = true;
    };

    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) apply(m);
    } else if (mesh.material) {
      apply(mesh.material);
    }
  }

  private restoreMaterial(mesh: THREE.Mesh) {
    const tag = "__projection_decal_patched";
    const restore = (mat: THREE.Material) => {
      const mm = mat as any;
      if (mm[tag] && mm._origOBC) {
        mat.onBeforeCompile = mm._origOBC;
        delete mm[tag];
        delete mm._origOBC;
        mat.needsUpdate = true;
      }
    };
    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) restore(m);
    } else if (mesh.material) {
      restore(mesh.material);
    }
  }
}
