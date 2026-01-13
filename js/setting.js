let world;
let font;
let uploadHandler;
let pg;
let myShader;
let currentText = '';
let currentIndex = 0.5;
let opentypeFont;
let fruticose;

const GROWTH_LIMIT = 2000;  // 점이 이 개수에 도달하면 성장이 서서히 멈춤
const RIGIDITY = 0.5;      // 값이 높을수록 글자의 원래 형태를 더 뻣뻣하게 유지함 (0.1 ~ 0.5 권장)
const DENSITY = 5;         // 점 사이의 최대 거리. 이 값이 커질수록 덜 자라고 모양이 단순해짐 (4~10 권장)

var settings = {
    MinDistance: 2.2, //점들이 너무 밀착하지 않아야 뭉갤 부피가 생김. 2추천  //변화 주기 좋음 ⭐️
    MaxDistance: 5,
    RepulsionRadius: 17, // 가지의 두께?
    AttractionForce: 0.2, // 형태를 잡아주는 힘 강화
    RepulsionForce: 0.78, // 높일수록 더 우그러짐
    AlignmentForce: 0.9, //정렬하려는 힘. (곡선을 더 매끄럽게 펴줌) //변화 주기 좋음 ⭐️ 낮추기!! 
    NodeInjectionInterval: 130, //점 주입 속도를 낮춤 (모양유지에 도움)
    FillMode: true, 
   //InvertedColors: false,
    UseBrownianMotion: true, // 모양을 랜덤하게 흔듦
    BrownianMotionRange: 0.5,
    MaxVelocity: 1.2, // 움직임 속도 (값들이 클 수록 빨리 움직임)
    Rotation: 0
};

window.settings = settings;

function preload() {
    font = loadFont('IBMPlexMono-Bold.otf');
}
function setup() {
    let canvases = document.querySelectorAll('canvas');
    canvases.forEach(c => c.remove());

    createCanvas(windowWidth, windowHeight);
    colorMode(HSB, 255);

    const sW = document.getElementById('slider-mutation-w');
    const sH = document.getElementById('slider-mutation-h');
    if (sW) sW.oninput = () => generateTextGrowth(currentText);
    if (sH) sH.oninput = () => generateTextGrowth(currentText);

    if(typeof World !== 'undefined') {
        world = new World (this, window.settings);
        window.world = world;
    }

    fruticose = new Fruticose();
    console.log("Fruticose 인스턴스 생성됨:");

    document.body.classList.add("show-placeholder");
    
    // 1. 핸들러는 딱 하나만 전역으로 생성
    uploadHandler = new UploadHandler(this);
    uploadHandler.init();

    const logo = document.querySelector('.Logo');
    const gallery = document.getElementById('font-gallery');

    if (logo && gallery) {
        logo.onclick = () => {
            //gallery.style.display ='';
            gallery.classList.toggle('is-visible');
        };
    }

    // 2. 드래그 시작 시 데이터 확실히 심기
    const fontItems = document.querySelectorAll('.font-item');
    fontItems.forEach(item => {
        item.ondragstart = function(e) {
            const url = this.getAttribute('data-font-url');
            // 브라우저마다 호환성이 다르므로 모든 타입으로 저장
            e.dataTransfer.setData("text/plain", url);
            e.dataTransfer.setData("font-url", url);
            console.log("드래그 시작됨:", url);
        };
    });

    // 3. 윈도우 전체 드롭 감지 (가장 높은 우선순위)
    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const fontUrl = e.dataTransfer.getData("font-url") || e.dataTransfer.getData("text/plain");
        console.log("드롭 감지! URL:", fontUrl);

        if (fontUrl && uploadHandler) {
            uploadHandler.loadFontFromUrl(fontUrl);
        }
    }, false);

    document.body.classList.add("is-ready");
}

function initFontGallery() {
    const gallery = document.getElementById('font-gallery');
    const items = document.querySelectorAll('.font-item');
    
    items.forEach(item => {
        // 드래그 시작 시 URL 저장
        item.addEventListener('dragstart', (e) => {
            const url = item.getAttribute('data-font-url');
            e.dataTransfer.setData("font-url", url);
        });
    });
}

function updateMutation() {
    const amountX = sliderW ? parseFloat(sliderW.value) : 0;
    const amountY = sliderH ? parseFloat(sliderH.value) : 0;
    
    // 현재 텍스트와 슬라이더 값을 기반으로 물리 객체 재생성
    generateTextGrowth(currentText, {
        amountX: amountX,
        amountY: amountY,
        mode: 'warp' // 예시 모드
    });
}

function doubleClicked() {
    if (world) {
        world.clearPaths();
    }
    currentText = "";
    background(255);
    
    document.body.classList.add("show-placeholder");
    generateTextGrowth(""); 
}


class Glyph {
    constructor(data, style) {
        // missing initializeProperties 해결
        this.data = data;
        this.path = data.path || (data.getPath ? data.getPath(0, 0, 72) : null);
        this.renderPath = this.path;
        
        // boundingBox가 width, height를 갖도록 계산
        const bbox = data.getBoundingBox();
        this.boundingBox = {
            x: bbox.x1,
            y: bbox.y1,
            width: bbox.x2 - bbox.x1,
            height: bbox.y2 - bbox.y1
        };
        this.p = 1; // 기본 스케일
    }

mutate(settings) {
    if (!this.path) return;
    this.renderPath = JSON.parse(JSON.stringify(this.path));
    // 1. 원본 복제
    //this.renderPath = this.clonePath(this.path);
    
    const { mode, rotationAngle, amountX, amountY } = settings;

    // 2. 경로의 모든 점들을 순회하며 변환
    this.renderPath.commands = this.renderPath.commands.map((cmd, i) => {
        // transformPath를 거쳐 점의 좌표(x, y, x1, y1 등)가 실제로 계산됨
        return this.transformPath(cmd, {
            index: i,
            mode: mode, 
            rotationAngle: rotationAngle,
            amountX: amountX,
            amountY: amountY
        });
    });
}

render(pg) {
    if (!this.renderPath) return;
    const ctx = pg.drawingContext;
    this.renderPath.draw(ctx); 
}
}


class UploadHandler {
    constructor(appInstance) {
        this.VALID_EXTENSIONS = [".woff", ".otf", ".ttf"];
        this.app = appInstance;
    }

    init() {
    }

    handleDrop(e) {
        // setup의 window.drop에서 호출됨
        const fontUrl = e.dataTransfer.getData("font-url") || e.dataTransfer.getData("text/plain");
        if (fontUrl) {
            this.loadFontFromUrl(fontUrl);
        } else if (e.dataTransfer.files.length > 0) {
            this.handleFiles(e.dataTransfer.files);
        }
    }
loadFontFromUrl(url) {
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(buffer => {
            const f = opentype.parse(buffer);
            window.opentypeFont = f;

            if (!currentText || currentText === "") {
                // [수정] 데이터가 없을 경우를 대비해 단계별로 확인하고 기본값 설정
                let fontName = "Fruticose";
                
                if (f.names && f.names.fontFamily) {
                    // 영어(en)가 없으면 다른 언어 이름이나 첫 번째 이름을 가져옴
                    fontName = f.names.fontFamily.en || 
                               Object.values(f.names.fontFamily)[0];
                }

                currentText = fontName;

                document.body.classList.remove("show-placeholder");
                const placeholder = document.querySelector('.Placeholder');
                if (placeholder) {
                    placeholder.style.display = 'none';
                    placeholder.style.opacity = '0';
                }
            }

            font = loadFont(url, () => {
                if (window.world) window.world.clearPaths();
                
                // [수정] 오타 수정: window.fruticose
                if (window.fruticose) {
                    window.fruticose.updateGlyphs(currentText);
                }

                generateTextGrowth(currentText);
            });
        })
        .catch(err => {
            console.error("Font Load Error:", err);
        });
}

    handleFiles(files) {
        [...files].forEach(file => this.uploadFile(file));
    }

    uploadFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target.result;
                window.opentypeFont = opentype.parse(arrayBuffer);
                const url = URL.createObjectURL(new Blob([arrayBuffer]));
                font = loadFont(url, () => {
                    if (fruticose) fruticose.updateGlyphs(currentText);
                    generateTextGrowth(currentText);
                });
            } catch (err) { console.error("Parse error:", err); }
        };
        reader.readAsArrayBuffer(file);
    }
}



class Fruticose {
    constructor() {
        this.glyphs = [];
        //this.FILL_COLOR = "#000000";
        //this.STROKE_COLOR = "#ffffff";
        //this.STROKE_WIDTH = "2";
        this.word = "";
        //this.showHelpers = false;
        //this.uploadHandler = new UploadHandler(this);
    }

    // setting.js 내 Fruticose 클래스의 updateGlyphs 부분 점검
updateGlyphs(text) {
    if (!window.opentypeFont) return;
    this.word = text;
    this.glyphs = [];
    
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        // 폰트에서 글자 데이터 추출
        let glyphData = window.opentypeFont.charToGlyph(char);
        
        // Glyph 객체 생성 및 배열 저장
        let newGlyph = new Glyph(glyphData, {
            fillColor: "#000",
            strokeColor: "#fff",
            strokeWidth: 1
        });
        this.glyphs.push(newGlyph);
    }
}

    // 글자 가로 나열, 중앙 정렬, 잔상 제거
    renderWord(pg) {
        pg.clear();
        if (!this.glyphs || this.glyphs.length === 0) return;
        // 전체 단어 폭/최대 높이 계산
        let totalWidth = 0, maxHeight = 0;
        this.glyphs.forEach(glyph => {
            totalWidth += glyph.boundingBox.width * glyph.p;
            if (glyph.boundingBox && glyph.boundingBox.height > maxHeight) {
                maxHeight = glyph.boundingBox.height;
            }
        });
        totalWidth += 300; // app.min.js 스타일 여유
        pg.push();
        const scaleX = 1 / Math.abs(totalWidth / width);
        const scaleY = -scaleX;
        pg.translate(230 * scaleX, height / 2 - maxHeight / 2 * scaleY);
        pg.scale(scaleX, scaleY);
        let accX = 0;
        for (let i = 0; i < this.glyphs.length; i++) {
            let glyph = this.glyphs[i];
            if (i > 0) {
                accX += this.glyphs[i - 1].boundingBox.width * this.glyphs[i - 1].p;
            }
            pg.push();
            pg.translate(accX, 0);
            glyph.render(pg);
            pg.pop();
        }
        pg.pop();
    }
}

function draw() {
    if (!window.world) return;
    background(255);

    // 1. 모든 노드를 "월드 좌표(회전된 상태)"로 일시적 변환
    // 그래야 world.iterate()가 실제 화면에 보이는 겹침을 인식하고 밀어냅니다.
    let currentRot = (window.settings && window.settings.Rotation) ? window.settings.Rotation : 0;
    
    window.world.paths.forEach(path => {
        let cX = path.middleX || width / 2;
        let cY = path.middleY || height / 2;
        let rOffset = path.rotOffset || 0;
        let angle = (currentRot === 0) ? 0 : currentRot + rOffset;

        if (angle !== 0) {
            let cosA = Math.cos(angle);
            let sinA = Math.sin(angle);
            
            path.nodes.forEach(n => {
                let dx = n.x - cX;
                let dy = n.y - cY;
                
                // 현재 좌표를 월드 좌표(회전된 위치)로 일시 변경
                // n.position이 있으면 그것도 업데이트하여 에러 방지
                let wx = cX + (dx * cosA - dy * sinA);
                let wy = cY + (dx * sinA + dy * cosA);
                
                n.x = wx; n.y = wy;
                if (n.position) { n.position.x = wx; n.position.y = wy; }
                
                // 속도(velocity)도 함께 회전시켜야 물리 연산이 튀지 않습니다.
                if (n.velocity) {
                    let vx = n.velocity.x;
                    let vy = n.velocity.y;
                    n.velocity.x = vx * cosA - vy * sinA;
                    n.velocity.y = vx * sinA + vy * cosA;
                }
            });
        }
    });

    // 2. 물리 연산 실행 (이제 회전되어 겹친 노드들을 서로 밀어냄)
    if (!window.world.paused) {
        window.world.iterate();
    }

    // 3. 물리 연산 결과를 다시 "로컬 좌표"로 복원
    // 사용자님의 렌더링 로직이 translate/rotate를 쓰기 때문에 다시 되돌려줘야 합니다.
    window.world.paths.forEach(path => {
        let cX = path.middleX || width / 2;
        let cY = path.middleY || height / 2;
        let rOffset = path.rotOffset || 0;
        let angle = (currentRot === 0) ? 0 : currentRot + rOffset;

        if (angle !== 0) {
            let cosA = Math.cos(-angle); // 역회전
            let sinA = Math.sin(-angle);
            
            path.nodes.forEach(n => {
                let dx = n.x - cX;
                let dy = n.y - cY;
                
                let lx = cX + (dx * cosA - dy * sinA);
                let ly = cY + (dx * sinA + dy * cosA);
                
                n.x = lx; n.y = ly;
                if (n.position) { n.position.x = lx; n.position.y = ly; }

                if (n.velocity) {
                    let vx = n.velocity.x;
                    let vy = n.velocity.y;
                    n.velocity.x = vx * cosA - vy * sinA;
                    n.velocity.y = vx * sinA + vy * cosA;
                }
            });
        }
    });

    // --- 여기부터는 "훼손 금지" 요청하신 기존 렌더링 코드 ---
    fill(0); 
    stroke(255); 
    strokeWeight(1);

    let charGroups = {};
    window.world.paths.forEach(path => {
        let id = path.charId !== undefined ? path.charId : -1;
        if (!charGroups[id]) charGroups[id] = [];
        charGroups[id].push(path);
    });

    Object.keys(charGroups).forEach(id => {
        let pathsInChar = charGroups[id];
        if (pathsInChar.length === 0) return;

        push();
        let cX = pathsInChar[0].middleX || width / 2;
        let cY = pathsInChar[0].middleY || height / 2;
        let rOffset = pathsInChar[0].rotOffset || 0;

        translate(cX, cY); 
        if (window.settings && window.settings.Rotation !== undefined) {
            if (window.settings.Rotation === 0) {
                rotate(0);
            } else {
                rotate(window.settings.Rotation + rOffset);
            }
        }
        translate(-cX, -cY);

        beginShape();
        pathsInChar.forEach((path, pIdx) => {
            if (pIdx > 0) beginContour();
            path.nodes.forEach(n => {
                // n.x, n.y는 이제 물리 연산이 반영된(밀려난) 로컬 좌표입니다.
                vertex(n.x, n.y); 
            });
            if (pIdx > 0) endContour();
        });
        endShape(CLOSE);
        pop();
    });
}
function generateTextGrowth(txt) {
    if (!font || !window.world) return;
    window.world.clearPaths();

    const mutateW = document.getElementById('slider-mutation-w') ? parseFloat(document.getElementById('slider-mutation-w').value) : 0;
    const mutateH = document.getElementById('slider-mutation-h') ? parseFloat(document.getElementById('slider-mutation-h').value) : 0;
    
    // 1. (1.12 버전 기반) 초기 폰트 크기 계산
    let fontSize = constrain(width / (txt.length * 0.7 + 1), 50, 330);
    
    // 2. [추가] 자동 스케일링 보정 (어떤 폰트든 화면 밖으로 나가지 않게 함)
    let bbox = font.textBounds(txt, 0, 0, fontSize);
    let maxWidth = width * 0.8; // 화면 너비의 80%를 가이드라인으로 설정
    
    if (bbox.w > maxWidth) {
        fontSize *= (maxWidth / bbox.w); // 너비를 초과하면 초과한 비율만큼 폰트 크기 축소
        bbox = font.textBounds(txt, 0, 0, fontSize); // 축소된 크기로 다시 경계 상자 계산
    }
    
    // 3. (1.12 버전 기반) 중앙 정렬 좌표 계산
    let currentX = width / 2 - bbox.w / 2;
    let startY = height / 2 + bbox.h / 2;

    for (let i = 0; i < txt.length; i++) {
        let char = txt[i];

        // 글자별 독립된 중심축 및 회전 오프셋
        let charBbox = font.textBounds(char, currentX, startY, fontSize);
        let charCenterX = charBbox.x + charBbox.w / 2;
        let charCenterY = charBbox.y + charBbox.h / 2;
        let randomOffset = random(-PI, PI);

        let pts = font.textToPoints(char, currentX, startY, fontSize, {
            sampleFactor: 0.15, // 안정적인 물리 연산을 위해 밀도 최적화
            simplifyThreshold: 0,
        });

        // 다음 글자 위치 이동
        currentX += font.textBounds(char, 0, 0, fontSize).w + (fontSize * 0.05);

        if (pts.length > 0) {
            let groups = [];
            let currentGroup = [pts[0]];
            for (let j = 1; j < pts.length; j++) {
                if (dist(pts[j].x, pts[j].y, pts[j-1].x, pts[j-1].y) > 10) { 
                    groups.push(currentGroup);
                    currentGroup = [];
                }
                currentGroup.push(pts[j]);
            }
            groups.push(currentGroup);

            groups.forEach(group => {
                if (group.length > 3) {
                    const isClosed = dist(group[0].x, group[0].y, group[group.length - 1].x, group[group.length - 1].y) < 15;

                    // [수정] 글자마다 완전히 다른 물리 수치를 할당 (범위를 넓게 설정)
                    let personality = {
                        // 어떤 글자는 얇게(0.5), 어떤 글자는 아주 뚱뚱하게(2.5) 자람
                        repulsionMult: random(0.5, 2.5), 
                        // 어떤 글자는 매끄럽게(1.5), 어떤 글자는 구불구불하게(0.1) 자람
                        alignmentMult: random(0.05, 1.5), 
                        // 어떤 글자는 일찍 멈추고(400), 어떤 글자는 무한히 증식(3000)
                        growthLimit: floor(random(300, 2000)),
                        // 글자마다 자라나는 속도 자체를 다르게 설정
                        speedMult: random(0.5, 1.2)
                    };

                    let nodes = group.map((p, idx) => {
                        let offX = sin(idx * 0.5) * mutateW;
                        let offY = cos(idx * 0.5) * mutateH;
                        
                        // 생성되는 점들이 캔버스 밖 50px 경계 안쪽으로만 생성되게 강제
                        let safeX = constrain(p.x + offX, 50, width - 50);
                        let safeY = constrain(p.y + offY, 50, height - 50);
                        return new Node(this, safeX, safeY, window.settings);
                    });


                    let textPath = new Path(this, nodes, window.settings, isClosed);
                    textPath.charId = i; 
                    textPath.middleX = charCenterX;
                    textPath.middleY = charCenterY;
                    textPath.rotOffset = randomOffset;
                    textPath.personality = personality;

                    // 개별 iterate 로직 적용
                    textPath.iterate = function(tree) {
                        const p = this.personality;
                        const s = window.settings;

                        // 성장 제한 로직 적용
                        if (this.nodes.length < p.growthLimit) {
                            // 아직 성장 중일 때 기본 성장 함수 호출
                            if (Path.prototype.iterate) {
                                Path.prototype.iterate.apply(this, arguments);
                            }
                        }

                        // 모든 상태에서 개별 물리 법칙 적용
                        this.nodes.forEach((n, idx) => {
                            // 글자별로 다른 척력(Repulsion)과 정렬(Alignment) 힘 적용
                            this.applyRepulsion(idx, tree, s.RepulsionForce * p.repulsionMult); 
                            this.applyAlignment(idx, s.AlignmentForce * p.alignmentMult);
                            this.applyAttraction(idx);

                            // 속도 가중치 적용
                            if (n.acceleration) {
                                n.acceleration.mult(p.speedMult);
                            }
                            n.iterate();
                        });
                    };
                    
                    window.world.addPath(textPath);
                }
            });
        }
    }
}

function updateTextSize(txt) {
  // 캔버스 너비와 글자 수를 기준으로 폰트 크기 계산
  // 글자 수가 많아질수록 기본 크기(width/10 등)가 작아지도록 설계
  let dynamicSize = width / (txt.length * 0.6); 
  
  // 최소/최대 크기 제한 (너무 작아지거나 커지는 것 방지)
  dynamicSize = constrain(dynamicSize, 20, 100); 
  
  textSize(dynamicSize);
}

function keyPressed() {
    // 글자가 수정될 때 일시정지를 해제하여 물리 엔진이 작동하게 함
    //if (window.world && window.world.paused) { window.world.paused = false; }

    if (keyCode === BACKSPACE || keyCode === DELETE) {
        currentText = currentText.slice(0, -1);
        generateTextGrowth(currentText);

        if (currentText.length === 0) {
            document.body.classList.add("show-placeholder");
            background(255); 
        }
    } else if (key.length === 1 && key.match(/^[:;/Ññ.!¡¿=?*$A-Za-z0-9\(\)_]+$/)) {
        document.body.classList.remove("show-placeholder");
        currentText += key;
        generateTextGrowth(currentText);
    }
}

function keyReleased() {
    // 스페이스바를 누르면 성장을 멈추거나 다시 시작함
    if (key === ' ') {
        if (world) world.togglePause(); // 내부의 paused 상태를 반전시킴
    }
}

function addPath(nodes) {
    let textPath = new Path(this, nodes, settings, true);
    const originalIterate = textPath.iterate;
    textPath.iterate = function(tree) {
        if (this.nodes.length > GROWTH_LIMIT) {
            this.nodes.forEach(n => {
                this.applyAttraction(this.nodes.indexOf(n));
                this.applyRepulsion(this.nodes.indexOf(n), tree);
                this.applyAlignment(this.nodes.indexOf(n));
                n.iterate();
            });
            return; 
        }
        originalIterate.apply(this, arguments);
    };
    world.addPath(textPath);
}

function renderGrowthText() {
    fill(0);
    stroke(0);
    strokeWeight(1);
    world.paths.forEach(path => {
        beginShape();
        path.nodes.forEach(n => {
            let posX = n.position ? n.position.x : n.x;
            let posY = n.position ? n.position.y : n.y;
            vertex(posX, posY);
        });
        endShape(path.closed ? CLOSE : undefined);
    });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(255);
  if (currentText !== "") {
        generateTextGrowth(currentText);
    }
}
