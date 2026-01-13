// shader.js

export const VERT = `#version 300 es
    in vec4 aPosition;
    in vec2 aTexCoord;
    out vec2 vTexCoord;
    void main() {
        vTexCoord = aTexCoord;
        gl_Position = aPosition;
    }
`;

export const BLUR_THRESH = `#version 300 es
    precision highp float;
    uniform sampler2D tex0;
    uniform vec2 texelSize;
    in vec2 vTexCoord;
    out vec4 fragColor;

    void main() {
        vec2 uv = vTexCoord;
        vec4 col = vec4(0.0);
        
        // 1. 블러 반경 대폭 확대 (각진 뼈대를 완전히 뭉개버림)
        // 샘플링 횟수를 늘려 아주 부드러운 그라데이션을 만듭니다.
        for(float x = -7.0; x <= 7.0; x++) {
            for(float y = -7.0; y <= 7.0; y++) {
                float dist = length(vec2(x, y));
                float weight = exp(-(dist * dist) / 40.0); // 가우시안 곡선을 더 넓게
                // 곱해지는 숫자(4.0)를 키울수록 더 뭉글뭉글해집니다.
                vec2 offset = vec2(x, y) * texelSize * 6.0; 
                col += texture(tex0, uv + offset) * weight;
            }
        }
        col /= 150.0; // 정규화 (전체 밝기 조절)

        // 2. 부드러운 경계 처리 (Threshold)
        // threshold를 낮출수록 두꺼워지고, softness를 높일수록 테두리가 매끄러워집니다.
        float threshold = 0.6; 
        float softness = 0.22; // 0.15 정도로 높여서 날카로움을 제거합니다.
        
        float alpha = smoothstep(threshold - softness, threshold + softness, col.a);
        
        // 최종 출력 (잉크 느낌)
        fragColor = vec4(0.0, 0.0, 0.0, alpha); 
    }
`;