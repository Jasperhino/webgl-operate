
import { vec2, vec3 } from 'gl-matrix';
import { v2, v3 } from '../gl-matrix-extensions';


/**
 * Helper class to generate a sphere geometry based on a refinable icosahedron
 */
export class Icosahedron {

    protected _faces: Array<vec3>;     // List of faces (triangles)
    protected _vertices: Array<vec3>;  // List of vertices
    protected _texcoords: Array<vec2>; // List of texture coordinates

    /**
     * Object constructor.
     */
    constructor() {
    }

    /**
     * Returns the base vertices for the icosahedron.
     */
    protected baseVertices(): Array<vec3> {
        // Icosahedron vertices (normalized) form three orthogonal golden rectangles:
        // http://en.wikipedia.org/wiki/Icosahedron#Cartesian_coordinates

        const t = (1.0 + Math.sqrt(5.0)) * 0.5;
        const i = 1.0 / Math.sqrt(t * t + 1.0);
        const a = t * i;

        const vertices: Array<vec3> = [
            vec3.fromValues(-i, a, 0),
            vec3.fromValues(i, a, 0),
            vec3.fromValues(-i, -a, 0),
            vec3.fromValues(i, -a, 0),
            vec3.fromValues(0, -i, a),
            vec3.fromValues(0, i, a),
            vec3.fromValues(0, -i, -a),
            vec3.fromValues(0, i, -a),
            vec3.fromValues(a, 0, -i),
            vec3.fromValues(a, 0, i),
            vec3.fromValues(-a, 0, -i),
            vec3.fromValues(-a, 0, i),
        ];

        return vertices;
    }

    /**
     * Returns the base faces for the icosahedron.
     */
    protected baseFaces(): Array<vec3> {
        const faces: Array<vec3> = [
            vec3.fromValues(0, 11, 5),
            vec3.fromValues(0, 5, 1),
            vec3.fromValues(0, 1, 7),
            vec3.fromValues(0, 7, 10),
            vec3.fromValues(0, 10, 11),

            vec3.fromValues(1, 5, 9),
            vec3.fromValues(5, 11, 4),
            vec3.fromValues(11, 10, 2),
            vec3.fromValues(10, 7, 6),
            vec3.fromValues(7, 1, 8),

            vec3.fromValues(3, 9, 4),
            vec3.fromValues(3, 4, 2),
            vec3.fromValues(3, 2, 6),
            vec3.fromValues(3, 6, 8),
            vec3.fromValues(3, 8, 9),

            vec3.fromValues(4, 9, 5),
            vec3.fromValues(2, 4, 11),
            vec3.fromValues(6, 2, 10),
            vec3.fromValues(8, 6, 7),
            vec3.fromValues(9, 8, 1),
        ];

        return faces;
    }

    /**
     * Refines the icosahedron. For each step, every triangle is split into 4.
     * @param vertices - List of vertices that is modified.
     * @param faces - List of faces that is modified.
     * @param levels - Number of levels of refinement.
     */
    protected refine(vertices: Array<vec3>, faces: Array<vec3>, levels: number): void {
        /* Create cache to avoid duplicating vertices. */
        const cache = new Map<number, number>();

        /* Execute specified number of refinement levels. */
        for (let i = 0; i < levels; i++) {
            const size = faces.length;

            /* Refine each face of the current level. */
            for (let f = 0; f < size; f++) {
                /* Get face to refine */
                const face = faces[f];

                /* Get vertices of the current face. */
                const a = face[0];
                const b = face[1];
                const c = face[2];

                /* Calculate center points of each edge. */
                const ab = this.split(a, b, vertices, cache);
                const bc = this.split(b, c, vertices, cache);
                const ca = this.split(c, a, vertices, cache);

                /* Split triangle into 4. */
                faces[f] = vec3.fromValues(ab, bc, ca);
                faces.push(vec3.fromValues(a, ab, ca));
                faces.push(vec3.fromValues(b, bc, ab));
                faces.push(vec3.fromValues(c, ca, bc));
            }
        }
    }

    /**
     * Splits an edge and returns the new vertex that is the center of the edge.
     * @param a - Index of first vertex.
     * @param b - Index of second vertex.
     * @param vertices - List of vertices that is modified.
     * @param cache - Cache to identify newly created vertices.
     */
    protected split(a: number, b: number, vertices: Array<vec3>, cache: Map<number, number>): number {
        /* Create hash to identify the new vertex. */
        const aSmaller: boolean = (a < b);
        const smaller = aSmaller ? a : b;
        const greater = aSmaller ? b : a;
        const hash = (smaller << 16) + greater;

        /* Check if a vertex between these two has already been created. */
        if (cache.has(hash)) {
            return cache.get(hash)!;
        }

        /* Create vertex between these two, normalize it to form a point on the sphere. */
        const pos = vec3.add(v3(), vertices[a], vertices[b]);
        vec3.normalize(pos, pos);
        vertices.push(pos);

        /* Put new vertex into the cache. */
        const index = vertices.length - 1;
        cache.set(hash, index);

        /* Return index of the new vertex. */
        return index;
    }

    /**
     * Generates the geometry of the icosahedron.
     * @param levels - Number of levels of refinement.
     */
    generateGeometry(levels: number): void {
        /* Create base geometry. */
        this._vertices = this.baseVertices();
        this._faces = this.baseFaces();

        /* Refine geometry. */
        if (levels > 0) {
            this.refine(this._vertices, this._faces, Math.min(Math.max(levels, 0), 8));
        }
    }

    /**
     * Generates texture coordinates for the icosahedron.
     */
    generateTextureCoordinates(): void {
        /* Create array for the texture coordinates. */
        this._texcoords = new Array<vec2>();

        /* Generate texture coordinates. */
        const ofs = 0.5;

        for (const pos of this._vertices) {
            const normal = vec3.normalize(v3(), pos);

            const uv = vec2.fromValues(
                ofs - (Math.atan2(normal[2], normal[0]) / (2.0 * Math.PI)),
                Math.asin(normal[1]) / Math.PI + ofs
            );

            this._texcoords.push(uv);
        }
    }

    /**
     * Read-only access to the faces of the icosahedron.
     */
    get faces(): Array<vec3> {
        return this._faces;
    }

    /**
     * Read-only access to the vertices of the icosahedron.
     */
    get vertices(): Array<vec3> {
        return this._vertices;
    }

    /**
     * Read-only access to the texture coordinates of the icosahedron.
     */
    get texcoords(): Array<vec2> {
        return this._texcoords;
    }

}
