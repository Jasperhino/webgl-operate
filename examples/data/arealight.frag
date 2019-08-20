
precision lowp float;

@import ../../source/shaders/facade.frag;


uniform sampler2D u_albedoTexture;
uniform sampler2D u_roughnessTexture;
uniform sampler2D u_metallicTexture;
uniform sampler2D u_normalTexture;

uniform vec3 u_eye;
uniform float u_roughness;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


varying vec4 v_vertex;
varying vec2 v_uv;

const float GAMMA = 2.2;
const float INV_GAMMA = 1.0 / GAMMA;
const float M_PI = 3.14159265359;


// linear to sRGB approximation
// see http://chilliant.blogspot.com/2012/08/srgb-approximations-for-hlsl.html
vec3 LINEARtoSRGB(vec3 color)
{
    return pow(color, vec3(INV_GAMMA));
}

// Uncharted 2 tone map
// see: http://filmicworlds.com/blog/filmic-tonemapping-operators/
vec3 toneMapUncharted2Impl(vec3 color)
{
    const float A = 0.15;
    const float B = 0.50;
    const float C = 0.10;
    const float D = 0.20;
    const float E = 0.02;
    const float F = 0.30;
    return ((color*(A*color+C*B)+D*E)/(color*(A*color+B)+D*F))-E/F;
}

// https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/master/src/shaders/tonemapping.glsl
// Commit 6f1fb2d
vec3 toneMapUncharted(vec3 color)
{
    const float W = 11.2;
    color = toneMapUncharted2Impl(color * 2.0);
    vec3 whiteScale = 1.0 / toneMapUncharted2Impl(vec3(W));
    return LINEARtoSRGB(color * whiteScale);
}


// PBR implementation adapted from https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/master/src/shaders/metallic-roughness.frag
// commit 6f1fb2d

// The following equation models the Fresnel reflectance term of the spec equation (aka F())
// Implementation of fresnel from [4], Equation 15
vec3 specularReflection(vec3 reflectance0, vec3 reflectance90, float VdotH)
{
    return reflectance0 + (reflectance90 - reflectance0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);
}

// Smith Joint GGX
// Note: Vis = G / (4 * NdotL * NdotV)
// see Eric Heitz. 2014. Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs. Journal of Computer Graphics Techniques, 3
// see Real-Time Rendering. Page 331 to 336.
// see https://google.github.io/filament/Filament.md.html#materialsystem/specularbrdf/geometricshadowing(specularg)
float visibilityOcclusion(float alphaRoughnessSq, float NdotL, float NdotV)
{
    float GGXV = NdotL * sqrt(NdotV * NdotV * (1.0 - alphaRoughnessSq) + alphaRoughnessSq);
    float GGXL = NdotV * sqrt(NdotL * NdotL * (1.0 - alphaRoughnessSq) + alphaRoughnessSq);

    float GGX = GGXV + GGXL;
    if (GGX > 0.0)
    {
        return 0.5 / GGX;
    }
    return 0.0;
}

// The following equation(s) model the distribution of microfacet normals across the area being drawn (aka D())
// Implementation from "Average Irregularity Representation of a Roughened Surface for Ray Reflection" by T. S. Trowbridge, and K. P. Reitz
// Follows the distribution function recommended in the SIGGRAPH 2013 course notes from EPIC Games [1], Equation 3.
float microfacetDistribution(float alphaRoughnessSq, float NdotH)
{
    float f = (NdotH * alphaRoughnessSq - NdotH) * NdotH + 1.0;
    return alphaRoughnessSq / (M_PI * f * f);
}

vec3 specularBrdf(vec3 V, vec3 N, vec3 L, vec3 illuminance, vec3 reflectance0, vec3 reflectance90, float alphaRoughnessSq, float D_normalization)
{
    vec3 H = normalize(V + L);

    float VdotH = clamp(dot(V, H), 0.0, 1.0);
    float NdotL = clamp(dot(N, L), 0.0, 1.0);
    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float NdotH = clamp(dot(N, H), 0.0, 1.0);

    if (NdotL < 0.0 && NdotV < 0.0) {
        return vec3(0.0);
    }

    vec3 F = specularReflection(reflectance0, reflectance90, VdotH);
    float Vis = visibilityOcclusion(alphaRoughnessSq, NdotL, NdotV);
    float D = microfacetDistribution(alphaRoughnessSq, NdotH) * D_normalization;

    vec3 specularContribution = F * Vis * D;

    return specularContribution * NdotL * illuminance;
}

// Importance sampling with GGX introduces the pdf: D * NdotH / (4.0 * VdotH)
// Therefore D cancels out
vec3 specularBrdfGGXImportanceSampled(vec3 V, vec3 N, vec3 L, vec3 illuminance, vec3 reflectance0, vec3 reflectance90, float alphaRoughnessSq)
{
    vec3 H = normalize(V + L);

    float VdotH = clamp(dot(V, H), 0.0, 1.0);
    float NdotL = clamp(dot(N, L), 0.0, 1.0);
    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float NdotH = clamp(dot(N, H), 0.0, 1.0);

    if (NdotL < 0.0 && NdotV < 0.0) {
        return vec3(0.0);
    }

    vec3 F = specularReflection(reflectance0, reflectance90, VdotH);
    float Vis = visibilityOcclusion(alphaRoughnessSq, NdotL, NdotV);

    vec3 specularContribution = F * Vis;

    return specularContribution * NdotL * illuminance;
}

// Adapted from "Moving Frostbite to PBR"
vec3 uniformSampleSphere(float u1, float u2)
{
    float phi = 2.0 * M_PI * u2;
    float cosTheta = 1.0 - 2.0 * u1;
    float sinTheta = sqrt(max (0.0 , 1.0 - cosTheta * cosTheta));

    return vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
}

// Adapted from "Real Shading in Unreal Engine 4"
vec3 importanceSampleGGX(vec2 Xi, float alphaRoughnessSq, vec3 N)
{
    float Phi = 2.0 * M_PI * Xi.x;
    float CosTheta = sqrt((1.0 - Xi.y) / (1.0 + (alphaRoughnessSq - 1.0) * Xi.y));
    float SinTheta = sqrt(1.0 - CosTheta * CosTheta);

    vec3 H;
    H.x = SinTheta * cos(Phi);
    H.y = SinTheta * sin(Phi);
    H.z = CosTheta;
    vec3 UpVector = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 TangentX = normalize(cross( UpVector, N));
    vec3 TangentY = cross(N, TangentX);
    // Tangent to world space
    return TangentX * H.x + TangentY * H.y + N * H.z;
}

// https://gist.github.com/wwwtyro/beecc31d65d1004f5a9d
float raySphereIntersect(vec3 r0, vec3 rd, vec3 s0, float sr, out bool hit) {
    // - r0: ray origin
    // - rd: normalized ray direction
    // - s0: sphere center
    // - sr: sphere radius
    // - Returns distance from r0 to first intersecion with sphere,
    //   or -1.0 if no intersection.
    float a = dot(rd, rd);
    vec3 s0_r0 = r0 - s0;
    float b = 2.0 * dot(rd, s0_r0);
    float c = dot(s0_r0, s0_r0) - (sr * sr);
    if (b*b - 4.0*a*c < 0.0) {
        hit = false;
    }

    hit = true;
    return (-b - sqrt((b*b) - 4.0*a*c))/(2.0*a);
}

float rand(vec2 co){
    return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}

// https://learnopengl.com/PBR/IBL/Specular-IBL
float RadicalInverse_VdC(uint bits)
{
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return float(bits) * 2.3283064365386963e-10; // / 0x100000000
}

vec2 Hammersley(uint i, uint N)
{
    return vec2(float(i)/float(N), RadicalInverse_VdC(i));
}

vec2 Nth_weyl(int n) { // borrowed from https://www.shadertoy.com/view/3lsXW2
    return fract(vec2(n*12664745, n*9560333)/exp2(24.));
}

vec3 evaluateSphereLightBruteForce(vec3 V, vec3 N, vec3 lightColor, vec3 reflectance0, vec3 reflectance90, float alphaRoughnessSq) {
    const int SAMPLE_COUNT = 16;
    const vec3 SPHERE_POSITION = vec3(-1.0, 0.5, -1.0);
    const float SPHERE_RADIUS = 0.25;

    vec3 light = vec3(0.0);

    // Could we flip the sphere normal if it points away from shaded point and adjust the area accordingly?
    // This would double the ffective sample count
    float sphereArea = 4.0 * M_PI * SPHERE_RADIUS * SPHERE_RADIUS;
    float pdf = 1.0 / sphereArea;

    for (int i = 0; i < SAMPLE_COUNT; ++i) {
        vec2 u = Nth_weyl(int(v_uv.x * v_uv.y * 4324231.8) + i);
        // vec2 u = Hammersley(uint(i), uint(SAMPLE_COUNT - 1));
        // vec2 u = vec2(rand(v_uv + vec2(float(i))), rand(v_uv + vec2(float(i * 3))));

        vec3 sphereNormal = uniformSampleSphere(u.x, u.y);

        // if (dot(sphereNormal, normalize(SPHERE_POSITION - v_vertex.xyz)) > 0.0) {
        //     sphereNormal = -sphereNormal;
        // }

        vec3 spherePosition = sphereNormal * SPHERE_RADIUS + SPHERE_POSITION;
        vec3 lightVector = spherePosition - v_vertex.xyz;
        float sqDist = dot(lightVector, lightVector);
        vec3 L = normalize(lightVector);

        // turn this from an area integral to a solid angle integral
        float lightPdf = pdf * sqDist / clamp(dot(sphereNormal, -L), 0.0, 1.0);
        vec3 L_i = lightColor; // incoming radiance from light source (unit: W / sr*m^2)
        vec3 integralSample = L_i / lightPdf;

        light += specularBrdf(V, N, L, integralSample, reflectance0, reflectance90, alphaRoughnessSq, 1.0);
    }

    return light / float(SAMPLE_COUNT);
}

vec3 evaluateSphereLightImportanceSampleGGX(vec3 V, vec3 N, vec3 lightColor, vec3 reflectance0, vec3 reflectance90, float alphaRoughnessSq) {
    const int SAMPLE_COUNT = 16;
    const vec3 SPHERE_POSITION = vec3(1.0, 0.5, -1.0);
    const float SPHERE_RADIUS = 0.25;

    vec3 light = vec3(0.0);

    float sphereArea = 4.0 * M_PI * SPHERE_RADIUS * SPHERE_RADIUS;

    for (int i = 0; i < SAMPLE_COUNT; ++i) {
        vec2 u = Nth_weyl(int(v_uv.x * v_uv.y * 4324231.8) + i);
        // vec2 u = Hammersley(uint(i), uint(SAMPLE_COUNT));
        // vec2 u = vec2(rand(v_uv + vec2(float(i))), rand(v_uv + vec2(float(i * 3))));

        vec3 H = importanceSampleGGX(u, alphaRoughnessSq, N);

        vec3 sampleDir = reflect(V, H);

        bool hit;
        float t = raySphereIntersect(v_vertex.xyz, sampleDir, SPHERE_POSITION, SPHERE_RADIUS, hit);

        if (!hit || t >= 0.0) continue;

        float NdotH = clamp(dot(N, H), 0.0, 1.0);
        float VdotH = clamp(dot(V, H), 0.0, 1.0);

        // Math behind calculating the pdf: https://schuttejoe.github.io/post/ggximportancesamplingpart1/
        // Note that the D term is not included since it cancels out with the BRDF
        float pdf = NdotH / (4.0 * VdotH);

        vec3 spherePosition = v_vertex.xyz + t * sampleDir;
        vec3 sphereNormal = normalize(spherePosition - SPHERE_POSITION);

        vec3 lightVector = spherePosition - v_vertex.xyz;
        float sqDist = dot(lightVector, lightVector);
        vec3 L = normalize(lightVector);

        vec3 L_i = lightColor; // incoming radiance from light source (unit: W / sr*m^2)
        vec3 integralSample = L_i / pdf;

        light += specularBrdfGGXImportanceSampled(V, N, L, integralSample, reflectance0, reflectance90, alphaRoughnessSq);
    }

    return light / float(SAMPLE_COUNT);
}

// See "Real Shading in Unreal Engine 4"
vec3 evaluateSphereLightKaris(vec3 V, vec3 N, vec3 lightColor, vec3 reflectance0, vec3 reflectance90, float alphaRoughness) {
    const vec3 SPHERE_POSITION = vec3(-1.0, 0.5, 1.0);
    const float SPHERE_RADIUS = 0.25;

    float sphereArea = 4.0 * M_PI * SPHERE_RADIUS * SPHERE_RADIUS;

    vec3 R = reflect(V, N);
    vec3 L_center = SPHERE_POSITION - v_vertex.xyz;
    vec3 centerToRay = dot(L_center, R) * R - L_center;
    vec3 closestPoint = L_center + centerToRay * clamp(SPHERE_RADIUS / length(centerToRay), 0.0, 1.0);
    vec3 L = normalize(closestPoint);
    float sqDist = dot(closestPoint, closestPoint);

    // Since we only take one sample we want to get the total light power
    // We need to convert units since lightColor is in W / sr*m^2
    // Multiply by PI to get W / m^2 (since we assume a lambertian light source and the integral of cos over hemisphere sums to PI)
    // Then multiply by area to get W
    vec3 lightPower = M_PI * sphereArea * lightColor;
    // Estimate the irradiance from total light power
    // Note: this formula is an approximation that assumes the light source is a point light at the newly calculated light position
    vec3 irradiance = lightPower / (4.0 * M_PI * sqDist);

    // This normalization factor given by Karis should be used to scale the NDF
    float normalization = alphaRoughness / (alphaRoughness + SPHERE_RADIUS / (2.0 * sqrt(sqDist)));
    normalization = normalization * normalization;

    return specularBrdf(V, N, L, irradiance, reflectance0, reflectance90, alphaRoughness * alphaRoughness, normalization);
}

vec3 evaluateSphereLightNew(vec3 V, vec3 N, vec3 lightColor, vec3 reflectance0, vec3 reflectance90, float alphaRoughness) {
    const vec3 SPHERE_POSITION = vec3(1.0, 0.5, 1.0);
    const float SPHERE_RADIUS = 0.25;

    float sphereArea = 4.0 * M_PI * SPHERE_RADIUS * SPHERE_RADIUS;
    float pdf = 1.0 / sphereArea;

    vec3 R = reflect(V, N);
    vec3 L_center = SPHERE_POSITION - v_vertex.xyz;
    vec3 centerToRay = dot(L_center, R) * R - L_center;
    vec3 closestPoint = L_center + centerToRay * clamp(SPHERE_RADIUS / length(centerToRay), 0.0, 1.0);

    // Determine best approximation ray for integral
    vec3 L_phi_o = normalize(L_center);
    vec3 L_phi_i = normalize(closestPoint);
    vec3 L = normalize(mix(L_phi_o, L_phi_i, 0.5));

    // Calculate intersection with sphere to get distance and light normal
    bool hit;
    float t = raySphereIntersect(v_vertex.xyz, L, SPHERE_POSITION, SPHERE_RADIUS, hit);

    // if (!hit || t >= 0.0) return vec3(0.0);

    vec3 spherePosition = v_vertex.xyz + t * L;
    vec3 sphereNormal = normalize(spherePosition - SPHERE_POSITION);

    vec3 lightVector = spherePosition - v_vertex.xyz;
    float sqDist = dot(lightVector, lightVector);

    // turn this from an area integral to a solid angle integral
    float lightPdf = pdf * sqDist / clamp(dot(sphereNormal, -L), 0.0, 1.0);
    vec3 L_i = lightColor; // incoming radiance from light source (unit: W / sr*m^2)
    vec3 integralSample = L_i / lightPdf;

    return specularBrdf(V, N, L, integralSample, reflectance0, reflectance90, alphaRoughness * alphaRoughness, 1.0);
}

void main(void)
{
    vec2 uv = v_uv;

    const vec3 normal = vec3(0.0, 1.0, 0.0);
    const vec3 tangent = vec3(1.0, 0.0, 0.0);
    const vec3 bitangent = vec3(0.0, 0.0, 1.0);
    mat3 TBN = mat3(tangent, bitangent, normal);

    vec3 albedoColor = texture(u_albedoTexture, uv).rgb;
    albedoColor = pow(albedoColor, vec3(GAMMA));

    vec3 normalSample = texture(u_normalTexture, uv).rgb;
    vec3 N = normalize(normalSample * 2.0 - 1.0);
    N = normalize(TBN * N);

    float roughness = texture(u_roughnessTexture, uv).r;
    roughness = pow(roughness, GAMMA);

    // roughness = clamp(roughness + 0.3, 0.0, 1.0);
    // roughness = clamp(roughness + 0.6, 0.0, 1.0);
    roughness = 0.5;

    float alphaRoughness = roughness * roughness;
    float alphaRoughnessSq = alphaRoughness * alphaRoughness;

    // Simplified material model just for metals
    vec3 reflectance0 = albedoColor;
    float reflectance = max(albedoColor.r, max(albedoColor.g, albedoColor.b));
    vec3 reflectance90 = vec3(clamp(reflectance * 50.0, 0.0, 1.0));

    vec3 V = normalize(u_eye - v_vertex.xyz);

    vec3 lighting = vec3(0.0);

    // Directional Light
    {
        vec3 L = vec3(0.0, 1.0, 0.0);
        const vec3 lightColor = vec3(1.0, 0.9, 0.9);

        lighting += specularBrdf(V, N, L, lightColor, reflectance0, reflectance90, alphaRoughnessSq, 1.0);
    }

    // Area Light Reference
    {
        const vec3 lightColor = vec3(1.0, 0.5, 0.5);

        lighting += evaluateSphereLightBruteForce(V, N, lightColor, reflectance0, reflectance90, alphaRoughnessSq);
    }

    // Area Light (Karis MRP approximation)
    {
        const vec3 lightColor = vec3(1.0, 0.5, 0.5);

        lighting += evaluateSphereLightKaris(V, N, lightColor, reflectance0, reflectance90, alphaRoughness);
    }

    // Area Light Importance Sampling GGX
    {
        const vec3 lightColor = vec3(1.0, 0.5, 0.5);

        lighting += evaluateSphereLightImportanceSampleGGX(V, N, lightColor, reflectance0, reflectance90, alphaRoughnessSq);
    }

    // Area Light - new approximation
    {
        const vec3 lightColor = vec3(1.0, 0.5, 0.5);

        lighting += evaluateSphereLightNew(V, N, lightColor, reflectance0, reflectance90, alphaRoughnessSq);
    }

    fragColor = vec4(lighting, 1.0);
    fragColor.rgb = toneMapUncharted(fragColor.rgb);
}
