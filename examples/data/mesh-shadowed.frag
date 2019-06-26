
precision lowp float;

@import ../../source/shaders/facade.frag;


uniform vec2 u_lightNearFar;
uniform mat4 u_lightView;
uniform mat4 u_lightProjection;

uniform sampler2D u_shadowMap;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


varying vec4 v_vertex;
varying vec2 v_uv;


@import ../../source/shaders/shadowpass;


const vec4 shadowColor = vec4(0.494, 0.753, 0.933, 1.0);
const float shadowBias = -0.001;


void main(void)
{
    vec4 vLightViewSpace = u_lightView * v_vertex;
    vec4 vLightViewProjectionSpace = u_lightProjection * vLightViewSpace;

    float light_depth = clamp((length(vLightViewSpace.xyz) - u_lightNearFar[0]) / (u_lightNearFar[1] - u_lightNearFar[0]), 0.0, 1.0);
    vec2 shadow_uv = (vLightViewProjectionSpace.xy / vLightViewProjectionSpace.w) * 0.5 + 0.5;

    float visibility = hardShadowCompare(u_shadowMap, shadow_uv, light_depth, shadowBias);

    vec4 color = vec4(0.8 + (v_vertex.xyz * 0.2 - 0.1), 1.0);
    fragColor = mix(shadowColor * color, color, step(1.0, visibility));
}
