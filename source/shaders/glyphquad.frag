precision mediump float;

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
    #extension GL_OES_standard_derivatives : enable
#else
    layout(location = 0) out vec4 fragColor;
#endif


uniform sampler2D u_glyphs;

varying vec2 v_texture_coord;

void main(void)
{
    /* requires blend: glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA); */

    float d = texture(u_glyphs, v_texture_coord).r;

    /**
     * Don't discard fragments, as we might need them for an id-buffer for clicking-interaction.
     * Furthermore, using if-statement and discard can slow down performance:
     * it's bad for IMR, TBR, TBDR and early-Z optimization
     * https://stackoverflow.com/questions/8509051/is-discard-bad-for-program-performance-in-opengl
     *
     */
    // if(d < 0.45)
    //     discard;

    /** black. @todo font color as vertex attrib or uniform */
    vec4 fc = vec4(1.0, 0.0, 0.0, 1.0);

    /** @todo mipmap access? */
    /* simplest aastep; when using multiframe sampling, smoothstep is not necessary and will add too much blur */
    float a = step(0.5, d);
    fragColor = vec4(fc.rgb, fc.a * a);
}
