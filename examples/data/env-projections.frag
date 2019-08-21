precision highp float;
precision highp int;

@import ../../source/shaders/facade.frag;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


uniform ivec2 u_viewport;
uniform float u_time;

uniform int u_mode;

uniform samplerCube u_cubemap;
uniform sampler2D u_equirectmap;
uniform sampler2D u_spheremap;
uniform sampler2D u_polarmap[2];


varying vec2 v_uv;
varying vec4 v_ray;


const float aspect = 1.0 / 1.0;

const float PI = 3.141592653589793;
const float OneOver2PI = 0.1591549430918953357688837633725;
const float OneOverPI  = 0.3183098861837906715377675267450;


void main(void)
{
    vec2 uv = v_uv;
    vec3 ray = normalize(v_ray.xyz);
    ray.x *= -1.0;

    if(u_mode == 0) {

        #if __VERSION__ == 100
            fragColor = textureCube(u_cubemap, vec3(ray));
        #else
            fragColor = texture(u_cubemap, vec3(ray));
        #endif

    } else if (u_mode == 1) {

        float v = acos(ray.y) * OneOverPI;
        float m = atan(ray.x, ray.z);
        uv = vec2(m * OneOver2PI + 0.5, v);

        fragColor = texture(u_equirectmap, uv);

    } else if (u_mode == 2) {

        ray = -ray.xzy;
        ray.x *= -1.0;
        // ray.z *= -1.0;
        ray.z += +1.0;
        uv = 0.5 + 0.5 * ray.xy / length(ray);

        fragColor = texture(u_spheremap, uv);

    } else if (u_mode == 3) {

        ray.y *= -1.0;

        float m = 1.0 + abs(asin(ray.y) * 2.0 / PI);
        uv = 0.5 + 0.5 * ray.xz / m;

        fragColor = mix(texture(u_polarmap[0], uv),
                        texture(u_polarmap[1], vec2(1.0, -1.0) * uv),
                        step(0.0, ray.y));

    }
}
