precision mediump float;
precision lowp int;

@import ./facade.vert;

#if __VERSION__ == 100
    #extension GL_EXT_draw_buffers : enable
    attribute vec2 a_quadVertex;
    /* [ texture ll: vec2, ur: vec2 ] */
    attribute vec4 a_texCoord;
    attribute vec3 a_origin;
    attribute vec3 a_tangent;
    attribute vec3 a_up;
#else
    layout(location = 0) in vec2 a_quadVertex;
    /* [ texture ll: vec2, ur: vec2 ]*/
    layout(location = 1) in vec4 a_texCoord;
    layout(location = 2) in vec3 a_origin;
    layout(location = 3) in vec3 a_tangent;
    layout(location = 4) in vec3 a_up;
#endif

uniform mat4 u_viewProjection;
uniform vec2 u_ndcOffset;

varying vec2 v_texture_coord;

@import ./ndcoffset;

void main(void)
{
    /* TEXTURE COORDS */

    /* flip y-coordinates */
    vec2 texExt = vec2(a_texCoord[2] - a_texCoord[0], a_texCoord[1] - a_texCoord[3]);

    v_texture_coord = a_quadVertex * texExt + vec2(a_texCoord[0], 1.0 - a_texCoord[1]);

    /* POSITIONING*/
    /* quad data as flat array: [0, 0,  0, 1,  1, 0,  1, 1] (a_quadVertex), which translates to ll, lr, ul, ur corners.
     * 2-------4
     * |  \    |
     * |    \  |
     * 1-------3
     * The current vertex is calculated based on the current quad corners and the tangent / up attributes.
     * The following lines are optimized for MAD optimization.
     */
    vec3 tangentDirection = a_origin + a_quadVertex.x * a_tangent;
    vec4 vertex = vec4(tangentDirection + a_quadVertex.y * a_up, 1.0);

    vertex = u_viewProjection * vertex;

    ndcOffset(vertex, u_ndcOffset);
    gl_Position = vertex;
}
