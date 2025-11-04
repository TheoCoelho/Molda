import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";

/**
 * SurfaceDecal: cria uma malha (mesh) recortada da superfície alvo e mapeada com a textura do decal.
 * 
 * Vantagens sobre projeção por shader:
 * - Recorta a malha do decal contra um volume (caixa) no espaço do projetor
 * - UVs do decal são estáveis (x,z do espaço do projetor)
 * - Menos distorção nas bordas e sem “bleeding” fora da área
 */
export type SurfaceDecalSize = { width: number; height: number; depth?: number };

export type SurfaceDecalOptions = {
	/** Limite angular (graus) para evitar que o decal "vire a quina". 75–88 recomendado. */
	angleClampDeg?: number;
	/** Profundidade do decal (se ausente, é fração do maior lado). 0.15–0.30 do maior lado é bom. */
	depthFromSizeScale?: number;
	/** Habilita material com feather (borda suave). */
	useFeather?: boolean;
	feather?: number; // 0.06–0.12
	/** Considera apenas superfícies voltadas para o projetor (+Z local). Reduz borrões em dobras. */
	frontOnly?: boolean;
	/** Mantém apenas a metade da frente do volume (z>=0 no espaço do decal). Evita pegar o lado de trás quando o decal fica grande. */
	frontHalfOnly?: boolean;
	/** Se o triângulo recortado virar um filete muito fino no plano XY local, descartá-lo. (0.0 desliga) */
	sliverAspectMin?: number; // ex.: 0.01 significa min/max < 1% -> descarta
  /** Área mínima do triângulo recortado no plano XY local (em unidades do decal). Triângulos menores são descartados. */
  areaMin?: number; // ex.: 1e-6
	/** Mantém só a "faixa" mais próxima ao projetor ao longo de +Z: fração da profundidade permitida a partir do menor z. */
	zBandFraction?: number; // 0..1 (ex.: 0.2)
	/** Largura mínima absoluta do zBand (em unidades do mundo) para evitar cortes em decal muito raso. */
	zBandMin?: number; // ex.: 0.002
	/** Raio máximo no plano XY a partir do centro (em fração da maior dimensão). Descarta triângulos muito distantes. */
	maxRadiusFraction?: number; // ex.: 0.6 (60% do max(w,h))
	/** Limite superior para a profundidade real usada (fração do maior lado). */
	maxDepthScale?: number; // ex.: 0.35
};

type CandidateTri = {
	i0: number;
	i1: number;
	i2: number;
	zc: number;
	rc: number;
};

export class SurfaceDecal {
	public mesh: THREE.Mesh | null = null;
	private opts: Required<SurfaceDecalOptions>;

	constructor(private texture: THREE.Texture, opts: SurfaceDecalOptions = {}) {
		this.prepareTexture(this.texture);

		this.opts = {
			angleClampDeg: opts.angleClampDeg ?? 92, // usado apenas para backface extremo (-0.3)
			depthFromSizeScale: opts.depthFromSizeScale ?? 0.2,
			useFeather: opts.useFeather ?? false,
			feather: opts.feather ?? 0.08,
			frontOnly: opts.frontOnly ?? true,
			frontHalfOnly: opts.frontHalfOnly ?? false,
			sliverAspectMin: opts.sliverAspectMin ?? 0.001, // anti-deformação extrema
			areaMin: opts.areaMin ?? 1e-8, // anti-fragmentos microscópicos
			zBandFraction: opts.zBandFraction ?? 0.6, // faixa de profundidade ainda mais generosa
			zBandMin: opts.zBandMin ?? 0.015,
			maxRadiusFraction: opts.maxRadiusFraction ?? 1.0,
			maxDepthScale: opts.maxDepthScale ?? 1.0, // volume máximo para capturar curvas
		};
	}

	private prepareTexture(tex: THREE.Texture) {
		// Normaliza textura
		if ("colorSpace" in tex)
			(tex as any).colorSpace = (THREE as any).SRGBColorSpace;
		else (tex as any).encoding = (THREE as any).sRGBEncoding;
		tex.generateMipmaps = true;
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.wrapS = THREE.ClampToEdgeWrapping;
		tex.wrapT = THREE.ClampToEdgeWrapping;
	}

	private calcDepth(size: SurfaceDecalSize) {
		const major = Math.max(size.width, size.height);
		const desired = size.depth ?? major * this.opts.depthFromSizeScale;
		const maxDepth = major * this.opts.maxDepthScale;
		return Math.max(1e-3, Math.min(desired, maxDepth));
	}

		private computeEulerFromNormal(normal: THREE.Vector3, angleRad = 0) {
			// No DecalGeometry, o eixo de projeção é +Z local. Alinhar +Z à normal e girar em torno de +Z.
			const forward = new THREE.Vector3(0, 0, 1);
			const qAlign = new THREE.Quaternion().setFromUnitVectors(forward, normal.clone().normalize());
			const qRotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleRad);
			const q = qAlign.multiply(qRotZ);
			return new THREE.Euler().setFromQuaternion(q, "XYZ");
		}

	private makeBasicMat() {
		return new THREE.MeshBasicMaterial({
			map: this.texture,
			transparent: true,
			side: THREE.DoubleSide,
			depthTest: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -8,
			polygonOffsetUnits: -8,
		});
	}

	private makeFeatherMat() {
		return new THREE.ShaderMaterial({
			uniforms: {
				map: { value: this.texture },
				feather: { value: this.opts.feather },
			},
			vertexShader: `
				varying vec2 vUv;
				void main(){
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
				}
			`,
			fragmentShader: `
				uniform sampler2D map; uniform float feather; varying vec2 vUv;
				void main(){
					vec4 tex = texture2D(map, vUv);
					float d = distance(vUv, vec2(0.5));
					float inner = 0.5 - feather;
					float alpha = 1.0 - smoothstep(inner, 0.5, d);
					gl_FragColor = vec4(tex.rgb, tex.a * alpha);
				}
			`,
			transparent: true,
			side: THREE.DoubleSide,
			depthTest: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -8,
			polygonOffsetUnits: -8,
			toneMapped: true,
		});
	}

	private makeMaterial() {
		return this.opts.useFeather ? this.makeFeatherMat() : this.makeBasicMat();
	}

	setTexture(tex: THREE.Texture) {
		this.texture = tex;
		this.prepareTexture(tex);
		if (!this.mesh) return;
		const mat = this.mesh.material as any;
		if (mat && mat.isShaderMaterial && mat.uniforms && mat.uniforms.map) {
			mat.uniforms.map.value = tex;
			mat.needsUpdate = true;
		} else if (mat && mat.isMeshBasicMaterial) {
			mat.map = tex;
			mat.needsUpdate = true;
		}
	}

	// Cria uma base ortonormal para o projetor em espaço de mundo
	private makeBasis(normal: THREE.Vector3, angleRad: number) {
		const fwd = normal.clone().normalize(); // +Z do projetor
		const upRef = Math.abs(fwd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
		const right0 = new THREE.Vector3().crossVectors(upRef, fwd).normalize();
		const up0 = new THREE.Vector3().crossVectors(fwd, right0).normalize();
		const c = Math.cos(angleRad), s = Math.sin(angleRad);
		const right = right0.clone().multiplyScalar(c).add(up0.clone().multiplyScalar(s)).normalize();
		const up = up0.clone().multiplyScalar(c).sub(right0.clone().multiplyScalar(s)).normalize();
		return { right, up, fwd };
	}

	private keepPrimaryIsland(candidates: CandidateTri[]): CandidateTri[] {
		if (candidates.length <= 1) return candidates;

		const vertexToTriangles = new Map<number, number[]>();
		for (let idx = 0; idx < candidates.length; idx++) {
			const cand = candidates[idx];
			for (const v of [cand.i0, cand.i1, cand.i2]) {
				let list = vertexToTriangles.get(v);
				if (!list) {
					list = [];
					vertexToTriangles.set(v, list);
				}
				list.push(idx);
			}
		}

		// Seed = triângulo mais próximo (menor zc, desempate por menor rc)
		let seed = 0;
		for (let i = 1; i < candidates.length; i++) {
			const curr = candidates[i];
			const best = candidates[seed];
			if (curr.zc < best.zc - 1e-5) seed = i;
			else if (Math.abs(curr.zc - best.zc) <= 1e-5 && curr.rc < best.rc) seed = i;
		}

		const keep = new Array<boolean>(candidates.length).fill(false);
		const stack = [seed];
		keep[seed] = true;

		while (stack.length) {
			const current = stack.pop()!;
			const cand = candidates[current];
			for (const v of [cand.i0, cand.i1, cand.i2]) {
				const neighbors = vertexToTriangles.get(v);
				if (!neighbors) continue;
				for (const nb of neighbors) {
					if (!keep[nb]) {
						keep[nb] = true;
						stack.push(nb);
					}
				}
			}
		}

		const result = candidates.filter((_, idx) => keep[idx]);
		return result.length ? result : candidates;
	}

	private filterTriangles(
		geom: THREE.BufferGeometry,
		maxDeg: number,
		size: SurfaceDecalSize,
		actualDepth: number
	) {
		const idx = geom.getIndex();
		const pos = geom.getAttribute("position") as THREE.BufferAttribute;
		if (!idx || !pos) return geom;

		const indices = idx.array as any;
		const kept: number[] = [];
		const candidates: { i0:number;i1:number;i2:number; zc:number; rc:number }[] = [];
		const maxCos = Math.cos(THREE.MathUtils.degToRad(maxDeg));
		const maxRadius = Math.max(size.width, size.height) * 0.5 * this.opts.maxRadiusFraction;
		const maxDepth = actualDepth * 0.5;

		const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
		const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
		const a2 = new THREE.Vector2(), b2 = new THREE.Vector2(), c2 = new THREE.Vector2();
		for (let i = 0; i < indices.length; i += 3) {
			const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
			a.set(pos.array[ia], pos.array[ia + 1], pos.array[ia + 2]);
			b.set(pos.array[ib], pos.array[ib + 1], pos.array[ib + 2]);
			c.set(pos.array[ic], pos.array[ic + 1], pos.array[ic + 2]);
			ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac).normalize();
			// No espaço do DecalGeometry, +Z é o eixo de projeção
			const cosOk = (this.opts.frontOnly ? (n.z >= maxCos) : (Math.abs(n.z) >= maxCos));
			if (!cosOk) continue;

			// Mantém somente a metade da frente do volume quando habilitado
			if (this.opts.frontHalfOnly) {
				if (a.z < 0.0 || b.z < 0.0 || c.z < 0.0) continue; // exige TODOS os vértices na frente
			}
			
			// Restrição de profundidade extra: se o vértice mais distante em Z está além da metade da profundidade, descarta
			const maxZ = Math.max(a.z, b.z, c.z);
			if (maxZ > maxDepth) continue;

			const minZ = Math.min(a.z, b.z, c.z);
			const behindLimit = -Math.min(maxDepth * 0.22, 0.03);
			if (minZ < behindLimit) continue;

			// Filtro anti-filete: avalia aspecto no plano XY local
			if (this.opts.sliverAspectMin > 0) {
				a2.set(a.x, a.y); b2.set(b.x, b.y); c2.set(c.x, c.y);
				const minX = Math.min(a2.x, b2.x, c2.x), maxX = Math.max(a2.x, b2.x, c2.x);
				const minY = Math.min(a2.y, b2.y, c2.y), maxY = Math.max(a2.y, b2.y, c2.y);
				const dx = Math.max(1e-6, maxX - minX);
				const dy = Math.max(1e-6, maxY - minY);
				const aspect = Math.min(dx, dy) / Math.max(dx, dy); // 0..1 (filete -> quase 0)
				if (aspect < this.opts.sliverAspectMin) continue;
			}

			// Área mínima no plano XY para cortar fragmentos degenerados
			if (this.opts.areaMin > 0) {
				a2.set(a.x, a.y); b2.set(b.x, b.y); c2.set(c.x, c.y);
				const area = Math.abs((b2.x - a2.x)*(c2.y - a2.y) - (b2.y - a2.y)*(c2.x - a2.x)) * 0.5;
				if (area < this.opts.areaMin) continue;
			}

			// Calcula distância radial do centroide no plano XY (em torno da origem/centro do decal)
			const xc = (a.x + b.x + c.x) / 3.0;
			const yc = (a.y + b.y + c.y) / 3.0;
			const rc = Math.sqrt(xc*xc + yc*yc);
			
			// Descarta triângulos muito distantes do centro (evita pegar pedaços remotos ao ampliar)
			if (rc > maxRadius) continue;

			const zc = (a.z + b.z + c.z) / 3.0;
			candidates.push({ i0: indices[i], i1: indices[i+1], i2: indices[i+2], zc, rc });
		}

		// Mantém só a faixa mais próxima ao projetor (evita duplicação em múltiplas camadas)
		if (candidates.length) {
			let minZ = candidates[0].zc;
			for (const cnd of candidates) if (cnd.zc < minZ) minZ = cnd.zc;
			const band = Math.max(this.opts.zBandMin, this.opts.zBandFraction * Math.max(1e-6, actualDepth));
			for (const cnd of candidates) {
				if (cnd.zc - minZ <= band) {
					kept.push(cnd.i0, cnd.i1, cnd.i2);
				}
			}
		}
		if (kept.length < 3) return geom;
		const out = geom.clone();
		const IndexArray = (pos.count > 65535 ? Uint32Array : Uint16Array) as any;
		out.setIndex(new IndexArray(kept));
		out.computeVertexNormals();
		return out;
	}


	// Filtro em espaço de mundo usando a base do projetor (right, up, fwd)
	// FILOSOFIA EQUILIBRADA: aceita triangulos nas bordas mas rejeita deformações extremas
	// Filtros APENAS para qualidade (anti-deformação), NÃO para corte de bordas
	private filterTrianglesBasisWorld(
		geom: THREE.BufferGeometry,
		size: SurfaceDecalSize,
		originPoint: THREE.Vector3,
		basis: { right: THREE.Vector3; up: THREE.Vector3; fwd: THREE.Vector3 },
		maxDeg: number,
		actualDepth: number
	) {
		const idx = geom.getIndex();
		const pos = geom.getAttribute("position") as THREE.BufferAttribute;
		if (!idx || !pos) return geom;

		const indices = idx.array as any;
		const candidates: CandidateTri[] = [];
		const maxRadius = Math.max(size.width, size.height) * 0.5 * this.opts.maxRadiusFraction;

		const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
		const ra = new THREE.Vector3(), rb = new THREE.Vector3(), rcV = new THREE.Vector3();
		const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();

		for (let i = 0; i < indices.length; i += 3) {
			const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
			a.set(pos.array[ia], pos.array[ia + 1], pos.array[ia + 2]);
			b.set(pos.array[ib], pos.array[ib + 1], pos.array[ib + 2]);
			c.set(pos.array[ic], pos.array[ic + 1], pos.array[ic + 2]);

			// FILTRO ANTI-DEFORMAÇÃO 1: Rejeita triângulos voltados CONTRA o projetor (backfaces extremos)
			// Threshold muito permissivo (apenas > -0.3) para não cortar bordas curvadas
			ab.subVectors(b, a);
			ac.subVectors(c, a);
			n.crossVectors(ab, ac).normalize();
			const alignment = n.dot(basis.fwd);
			if (alignment < -0.18) continue; // tolera curvas moderadas, rejeita inversões severas

			// Coordenadas locais ao projetor
			ra.subVectors(a, originPoint);
			rb.subVectors(b, originPoint);
			rcV.subVectors(c, originPoint);
			const ax = ra.dot(basis.right), ay = ra.dot(basis.up), az = ra.dot(basis.fwd);
			const bx = rb.dot(basis.right), by = rb.dot(basis.up), bz = rb.dot(basis.fwd);
			const cx = rcV.dot(basis.right), cy = rcV.dot(basis.up), cz = rcV.dot(basis.fwd);

			// FILTRO ANTI-DEFORMAÇÃO 2: Rejeita filetes degenerados no espaço XY local
			// Threshold muito baixo (0.001) para pegar apenas casos patológicos
			const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
			const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
			const dx = Math.max(1e-6, maxX - minX);
			const dy = Math.max(1e-6, maxY - minY);
			const aspect = Math.min(dx, dy) / Math.max(dx, dy);
			if (aspect < 0.001) continue; // Rejeita apenas filetes extremos (1:1000 ou pior)

			// FILTRO ANTI-DEFORMAÇÃO 3: Rejeita triângulos com área microscópica no espaço XY
			// Área mínima absoluta muito pequena para pegar apenas degenerados
			const area = Math.abs((bx - ax)*(cy - ay) - (by - ay)*(cx - ax)) * 0.5;
			if (area < 1e-8) continue; // Apenas fragmentos microscópicos

			const minZ = Math.min(az, bz, cz);
			const behindLimit = -Math.min(actualDepth * 0.22, 0.03);
			if (minZ < behindLimit) continue;

			const xc = (ax + bx + cx) / 3.0;
			const yc = (ay + by + cy) / 3.0;
			const rcent = Math.hypot(xc, yc);
			const zc = (az + bz + cz) / 3.0;
			
			if (rcent > maxRadius) continue;
			candidates.push({ i0: indices[i], i1: indices[i + 1], i2: indices[i + 2], zc, rc: rcent });
		}

		if (!candidates.length) return geom;

		// Z-BAND: mantém apenas triângulos próximos à camada frontal
		let minZ = candidates[0].zc;
		for (const cnd of candidates) if (cnd.zc < minZ) minZ = cnd.zc;
		const band = Math.max(this.opts.zBandMin, this.opts.zBandFraction * Math.max(1e-6, actualDepth));
		let bandCandidates = candidates.filter((cnd) => cnd.zc - minZ <= band);
		
		if (!bandCandidates.length) {
			// Fallback: pega o mais próximo
			const best = candidates.reduce((prev, curr) =>
				curr.zc < prev.zc - 1e-5 ? curr : (Math.abs(curr.zc - prev.zc) <= 1e-5 && curr.rc < prev.rc ? curr : prev)
			);
			bandCandidates = [best];
		}

		// ILHA PRIMÁRIA: garante conectividade, elimina fragmentos isolados que causam duplicação
		let keptCandidates = this.keepPrimaryIsland(bandCandidates);
		if (!keptCandidates.length) keptCandidates = bandCandidates;

		const kept: number[] = [];
		for (const cnd of keptCandidates) kept.push(cnd.i0, cnd.i1, cnd.i2);
		if (kept.length < 3) return geom;
		
		const out = geom.clone();
		const IndexArray = (pos.count > 65535 ? Uint32Array : Uint16Array) as any;
		out.setIndex(new IndexArray(kept));
		out.computeVertexNormals();
		return out;
	}

	/** Constrói/atualiza a malha do decal. */
	build(
		target: THREE.Mesh,
		point: THREE.Vector3,
		normal: THREE.Vector3,
		size: SurfaceDecalSize,
		angleRad = 0
	) {
		const depth = this.calcDepth(size);
		const euler = this.computeEulerFromNormal(normal, angleRad);
		const geom = new DecalGeometry(
			target,
			point,
			euler,
			new THREE.Vector3(size.width, size.height, depth)
		) as THREE.BufferGeometry;


		// OBS: DecalGeometry já retorna a geometria pronta para uso no mundo.
		// Evitamos aplicar transformações adicionais para não deslocar a malha.
		// Usar filtro em espaço de mundo com base do projetor para isolar a camada mais próxima
		const basis = this.makeBasis(normal, angleRad);
		const filtered = this.filterTrianglesBasisWorld(
			geom,
			size,
			point,
			basis,
			this.opts.angleClampDeg,
			depth
		);
		const mat = this.makeMaterial();
		if (!this.mesh) this.mesh = new THREE.Mesh(filtered, mat);
		else {
			const old = this.mesh.geometry as THREE.BufferGeometry;
			this.mesh.geometry = filtered;
			old.dispose();
			// preserva material
		}
		this.mesh.renderOrder = 999;
		return this.mesh;
	}

	dispose() {
		if (!this.mesh) return;
		this.mesh.geometry.dispose();
		if ((this.mesh.material as any).dispose) (this.mesh.material as any).dispose();
		this.mesh = null;
	}
}

export default SurfaceDecal;

