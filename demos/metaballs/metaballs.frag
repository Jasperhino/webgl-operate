
precision lowp float;

@import ../../source/shaders/facade.frag;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif

uniform sampler2D u_metaballsTexture;
uniform int u_metaballsTextureSize;

uniform sampler2D u_lightsTexture;
uniform int u_lightsTextureSize;


uniform samplerCube u_cubemap;


varying vec2 v_uv;

# define BASE_ENERGY 0.06
# define THRESHOLD 0.5
# define STEP_THRESHOLD 0.01

// NOTE: the phong shading coeffcients are currently assumed to be the same for all metaballs.
# define AMBIENT_ILLUMINATION 0.3
# define DIFFUSE_ILLUMINATION 0.7
# define SPECULAR_ILLUMINATION 0.7


struct MetaBall {
    vec3 position;
    float energy;
};

struct FragmentValues {
    float energy;
    vec3 normal;
    vec3 rayPosition;
};

struct PointLight {
    vec3 position;
    float shininess;
};

const vec3 metaballColor = vec3(1.0, 0.5, 1.0);
const vec3 backgroundColor = vec3(0.9, 0.9, 0.9);

vec2 calculateAbsoluteTextureCoords(int width, int height, int maxWidth, int maxHeight) {
    return vec2(
        (2.0 * float(width) + 1.0) / (2.0 * float(maxWidth)),
        (2.0 * float(height) + 1.0) / (2.0 * float(maxHeight))
    );
}

MetaBall getMetaball(int index) {
    vec4 texVals = texture(u_metaballsTexture, calculateAbsoluteTextureCoords(index, 0, u_metaballsTextureSize, 1));
    MetaBall metaball;
    metaball.position = texVals.xyz;
    metaball.energy = BASE_ENERGY * texVals.w;
    return metaball;
}

PointLight getPointLight(int index) {
    vec4 texVals = texture(u_lightsTexture, calculateAbsoluteTextureCoords(index, 0, u_lightsTextureSize, 1));
    PointLight pointLight;
    pointLight.position = texVals.xyz;
    pointLight.shininess = texVals.w;
    return pointLight;
}

float distFunc(MetaBall metaball, vec3 rayPosition) {
    return metaball.energy / distance(metaball.position, rayPosition);
}


FragmentValues rayMarch(vec2 rayPosition) {
    for (float marchDistance = 0.0; marchDistance < 1.0; marchDistance += 0.01) {
        FragmentValues currentFragmentValues;
        currentFragmentValues.energy = 0.0;
        vec3 currentRayPosition = vec3(rayPosition, marchDistance);

        for (int metaballIndex = 0; metaballIndex < u_metaballsTextureSize; metaballIndex++) {

            MetaBall currentMetaball = getMetaball(metaballIndex);
            float currentEnergy = distFunc(currentMetaball, currentRayPosition);
            currentFragmentValues.energy += currentEnergy;
            vec3 currentNormal = normalize(currentRayPosition - currentMetaball.position);
            currentFragmentValues.normal += currentNormal * currentEnergy;
        }
        if(currentFragmentValues.energy > THRESHOLD) {
            currentFragmentValues.rayPosition = currentRayPosition;
            return currentFragmentValues;
        }
    }
    FragmentValues fragmentValues;
    return fragmentValues;
}

float calculateIllumination(FragmentValues fragmentValues) {
    // Phong shading
    float illumination = AMBIENT_ILLUMINATION;
    for (int lightIndex = 0; lightIndex < u_lightsTextureSize; lightIndex++) {
        PointLight pointLight = getPointLight(lightIndex);
        vec3 lightDirection = normalize(pointLight.position - fragmentValues.rayPosition);
        vec3 reflectDir = reflect(-lightDirection, fragmentValues.normal);

        float diffuse = max(dot(fragmentValues.normal, lightDirection), 0.0);

        float specularAngle = max(dot(reflectDir, fragmentValues.normal), 0.0);
        float specular = pow(specularAngle, pointLight.shininess);

        illumination += DIFFUSE_ILLUMINATION * diffuse;
        illumination += SPECULAR_ILLUMINATION * specular;
    }
    return illumination;
}

void main(void)
{
    // Compute the color
    //fragColor = vec4(vec3(rayMarch(v_uv)), 1.0);
    FragmentValues fragmentValues = rayMarch(v_uv);
    fragmentValues.normal = normalize(fragmentValues.normal);

    float illumination = 1.0;
    if (fragmentValues.energy > THRESHOLD) {
        illumination = calculateIllumination(fragmentValues);
    }
    vec4 envMap = texture(u_cubemap, vec3(normalize(abs(v_uv)), 1.0));
    fragColor = fragmentValues.energy > THRESHOLD ? vec4(metaballColor * illumination, 1.0) : envMap;
}

// NOTE for compilation errors look at the line number and subtract 7
