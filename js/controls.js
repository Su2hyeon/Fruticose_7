// controls.js
const Controls = {
    init() {
        this.setupHumiditySlider();
        this.setupRotationSlider();
    },

    setupHumiditySlider() {
        const sliderSpeed = document.getElementById('slider-1');
        if (!sliderSpeed) return;

        const minV = 0.6;
        const maxV = 1.6;
        const velocityFromSlider = (val) => {
            val = Number(val) / 100;
            return minV + val * (maxV - minV);
        };

        // inverse mapping: velocity -> slider (0..100)
        const sliderFromVelocity = (v) => {
            v = Number(v);
            const t = (v - minV) / (maxV - minV);
            return Math.round(Math.max(0, Math.min(100, t * 100)));
        };

        const applyVelocity = (newVelocity) => {
            if (window.settings) window.settings.MaxVelocity = newVelocity;
            // Also update world and path settings so any code reading those objects
            // will see the new velocity immediately.
            if (window.world) {
                try {
                    window.world.settings = window.world.settings || {};
                    window.world.settings.MaxVelocity = newVelocity;
                } catch (e) {
                    console.warn('Failed to update world.settings.MaxVelocity', e);
                }
            }
            if (window.world && window.world.paths) {
                window.world.paths.forEach(path => {
                    // update path-level settings if present
                    try {
                        path.settings = path.settings || {};
                        path.settings.MaxVelocity = newVelocity;
                    } catch (e) {
                        // ignore
                    }

                    path.nodes.forEach(node => {
                        // update likely property names used by Node
                        node.maxVelocity = newVelocity;
                        node.maxSpeed = newVelocity;
                        if (node.settings) node.settings.MaxVelocity = newVelocity;
                        // if there's a velocity vector with limit API (p5.Vector), clamp it
                        if (node.velocity && typeof node.velocity.limit === 'function') {
                            try { node.velocity.limit(newVelocity); } catch (err) { /* ignore */ }
                        }
                    });
                });
            }
        };

        // wire input
        sliderSpeed.oninput = () => {
            const val = parseFloat(sliderSpeed.value);
            const newVelocity = velocityFromSlider(val);
            applyVelocity(newVelocity);
        };

        // initialize slider position from current settings and apply to nodes
        try {
            const initialV = (window.settings && window.settings.MaxVelocity) ? window.settings.MaxVelocity : 1.3;
            sliderSpeed.value = sliderFromVelocity(initialV);
            applyVelocity(initialV);
        } catch (e) {
            console.warn('Failed to initialize speed slider:', e);
        }
    },

    setupRotationSlider() {
        const sliderRotate = document.getElementById('slider-2');
        if (!sliderRotate) return;

        sliderRotate.oninput = () => {
            // 슬라이더 0~100을 0~360도로 변환
            let degree = parseFloat(sliderRotate.value) * 3.6;
            
            if (window.settings) {
                // p5의 radians() 대신 표준 자바스크립트 계산식 사용 (MIME/Reference 에러 방지)
                window.settings.Rotation = degree * (Math.PI / 180);
            }
           
        };

        // 초기 바 위치 설정 (0.8 기준이 아닌 Rotation: 0 기준)
        sliderRotate.value = 0;
    }
};

// DOM이 준비된 후 실행되도록 안전하게 호출
try { 
    if (document.readyState === 'complete') {
        Controls.init();
    } else {
        window.addEventListener('load', () => Controls.init());
    }
} catch (e) { console.error("Controls init error:", e); }



//try { Controls.init(); } catch (e) { /* ignore */ }
