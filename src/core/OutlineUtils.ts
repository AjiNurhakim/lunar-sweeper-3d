import * as THREE from 'three';

export interface OutlineOptions {
    width?: number;
    color?: string | number | THREE.Color;
    opacity?: number;
    isGlass?: boolean;
}

/**
 * Creates a stylized cartoon outline material.
 * - Standard opaque meshes use the Inverted Hull (BackSide) normal extrusion technique.
 * - Transparent glass meshes use an edge silhouette Fresnel rim to keep the glass interior clear.
 */
const outlineMaterialCache = new Map<string, THREE.ShaderMaterial>();

export function createOutlineMaterial(options: OutlineOptions = {}): THREE.ShaderMaterial {
    const width = options.width ?? 0.0022;
    const color = options.color ? new THREE.Color(options.color) : new THREE.Color('#0F172A');
    const opacity = options.opacity ?? 1.0;
    const isGlass = options.isGlass ?? false;

    const cacheKey = `${width.toFixed(4)}_${color.getHexString()}_${opacity.toFixed(2)}_${isGlass}`;
    const cached = outlineMaterialCache.get(cacheKey);
    if (cached) return cached;

    let mat: THREE.ShaderMaterial;
    if (isGlass) {
        // Silhouette Rim Outline for transparent glass (keeps center transparent, outlines edges)
        mat = new THREE.ShaderMaterial({
            uniforms: {
                uOutlineWidth: { value: width },
                uOutlineColor: { value: color },
                uOutlineOpacity: { value: opacity }
            },
            vertexShader: `
                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;
                uniform float uOutlineWidth;

                void main() {
                    vec3 transformed = position + normal * (uOutlineWidth * 0.4);
                    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
                    vNormalWorld = normalize(mat3(modelMatrix) * normal);
                    vViewDirWorld = normalize(cameraPosition - worldPos.xyz);
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uOutlineColor;
                uniform float uOutlineOpacity;
                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;

                void main() {
                    float NdotV = abs(dot(vNormalWorld, vViewDirWorld));
                    // Rim threshold: only edges are visible
                    float rim = smoothstep(0.48, 0.18, NdotV);
                    if (rim < 0.05) discard;
                    gl_FragColor = vec4(uOutlineColor, rim * uOutlineOpacity);
                }
            `,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
    } else {
        // Standard Inverted Hull Outline for opaque meshes
        mat = new THREE.ShaderMaterial({
        uniforms: {
            uOutlineWidth: { value: width },
            uOutlineColor: { value: color },
            uOutlineOpacity: { value: opacity }
        },
        vertexShader: `
            uniform float uOutlineWidth;
            void main() {
                vec3 transformed = position + normal * uOutlineWidth;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uOutlineColor;
            uniform float uOutlineOpacity;
            void main() {
                gl_FragColor = vec4(uOutlineColor, uOutlineOpacity);
            }
        `,
        side: THREE.BackSide,
        transparent: opacity < 1.0,
        depthWrite: opacity >= 1.0,
        polygonOffset: true,
        polygonOffsetFactor: 1.0,
        polygonOffsetUnits: 1.0
    });
    }
    outlineMaterialCache.set(cacheKey, mat);
    return mat;
}

/**
 * Attaches a stylized cartoon outline child mesh to the given target mesh.
 */
export function attachOutline(mesh: THREE.Mesh, options: OutlineOptions = {}): THREE.Mesh {
    const mat = createOutlineMaterial(options);
    const outlineMesh = new THREE.Mesh(mesh.geometry, mat);
    outlineMesh.name = 'outline';
    mesh.add(outlineMesh);
    return outlineMesh;
}
