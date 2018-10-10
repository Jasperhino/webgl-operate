
import { vec3, vec4 } from 'gl-matrix';


/**
 * Information required for rendering a single glyph. Technical this could be denoted as a vertex of a vertex cloud.
 */
export interface GlyphVertex {

    /**
     * Position of the glyph in normalized device coordinates.
     */
    origin: vec3;

    /**
     * Tangent vector (usually the label's baseline direction). The length of this vector is expected to be the advance
     * of this glyphs geometry in baseline direction, i.e., it is used to derive the vertices using simple addition.
     */
    tangent: vec3;

    /**
     * Bitangent vector (orthogonal to the label's baseline). The length of this vector is expected to be the height of
     * this glyphs geometry, i.e., it is used to derive the glyph vertices using simple addition.
     */
    up: vec3;

    /**
     * Sub image rect of the glyph in the glyph texture (uv-coordinates).
     */
    uvRect: vec4;
}

/**
 * Vertex cloud that describes each glyph that is to be rendered on the screen.
 */
export class GlyphVertices extends Array<GlyphVertex> {

    // optimize() {

    // }

}
