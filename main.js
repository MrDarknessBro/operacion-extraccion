import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, controls;
let clock = new THREE.Clock();

// Movimiento y físicas
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isRunning = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// Jugador y Estadísticas
let health = 3;
let maxHealth = 3;
let isInvulnerable = false;
let currentWeaponId = 1;

let clipSize = { 1: 15, 2: 6 };
let ammo = { 1: 15, 2: 6 };        
let reserveAmmo = { 1: 30, 2: 12 };  

let zombiesKilled = 0;
let elapsedTime = 0;

// Elementos visuales del juego
let weaponGroup, weaponParts = {};
let muzzleFlash;
let flashlight;
let flashlightOn = true;

// Entidades del mundo y efectos
let zombies = [];
let mixers = [];
let collectibles = [];
let bloodParticles = [];
let extractionZone;
let walls = [];
let isGameOver = false, isVictory = false;
let isReloading = false;
let raycaster = new THREE.Raycaster();
let gltfLoader = new GLTFLoader();

// 🔊 SISTEMA DE AUDIO (THREE.AudioListener + Web Audio API nativa)
let soundListener;
let soundBuffers = {};
let audioLoader = new THREE.AudioLoader();

// Temporizadores
let ambientSoundTimer = 0;
let stepSoundTimer = 0;
let hordeSpawnTimer = 0;
let heartbeatTimer = 0;

init();
animate();

function init() {
    // 1. Escena y Cámara
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030201);
    scene.fog = new THREE.FogExp2(0x030201, 0.045);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 27);
    scene.add(camera);

    // 🔊 Inicializar el Listener de Audio en la cámara
    soundListener = new THREE.AudioListener();
    camera.add(soundListener);

    // Cargar los archivos de audio existentes (opcionales si los tienes)
    audioLoader.load('sounds/shot1.mp3', (buffer) => { soundBuffers.shoot1 = buffer; });
    audioLoader.load('sounds/shot2.mp3', (buffer) => { soundBuffers.shoot2 = buffer; });
    audioLoader.load('sounds/groan.mp3', (buffer) => { soundBuffers.groan = buffer; });

    // 2. Renderizador con sombras
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 3. Controles FPS PointerLock
    controls = new PointerLockControls(camera, document.body);
    controls.pointerSpeed = 0.45;
    
    const blocker = document.getElementById('blocker');
    blocker.addEventListener('click', () => {
        if (!isGameOver && !isVictory) {
            controls.lock();
        }
    });

    controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
    controls.addEventListener('unlock', () => { 
        if (!isGameOver && !isVictory) blocker.style.display = 'flex'; 
    });

    // 4. Luces
    const ambientLight = new THREE.AmbientLight(0x1a1512, 0.4);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xdfffe8, 4.5, 26, Math.PI / 5, 0.5, 1);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -5);
    camera.add(flashlight);
    camera.add(flashlight.target);

    createFirstPersonWeapons();
    buildHouseWorld();
    setupInputListeners();
    updateHUD();

    window.addEventListener('resize', onWindowResize);
}

// 🔊 SISTEMA DE AUDIO SINTETIZADO Y REPRODUCTOR (Sin necesidad de descargar archivos .mp3 extras)
function playSound(type) {
    if (!soundListener) return;
    try {
        const context = soundListener.context;
        if (!context) return;
        
        const now = context.currentTime;

        if (type === 'reload') {
            // Sonido metálico de recarga generado por código (clics mecánicos rápidos)
            for (let i = 0; i < 3; i++) {
                const osc = context.createOscillator();
                const gain = context.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400 + i * 150, now + i * 0.12);
                
                gain.gain.setValueAtTime(0.08, now + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.05);
                
                osc.connect(gain);
                gain.connect(context.destination);
                
                osc.start(now + i * 0.12);
                osc.stop(now + i * 0.12 + 0.05);
            }
        } 
        else if (type === 'heartbeat') {
            // Sonido de latido de corazón (Thump-Thump grave y profundo) cuando estás a 1/3 de vida
            [0, 0.2].forEach((delay, idx) => {
                const osc = context.createOscillator();
                const gain = context.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(idx === 0 ? 80 : 65, now + delay);
                osc.frequency.exponentialRampToValueAtTime(30, now + delay + 0.15);
                
                gain.gain.setValueAtTime(0.15, now + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
                
                osc.connect(gain);
                gain.connect(context.destination);
                
                osc.start(now + delay);
                osc.stop(now + delay + 0.15);
            });
        }
        else if (soundBuffers[type]) {
            // Para disparos o gruñidos si tienes sus buffers cargados
            const sound = new THREE.Audio(soundListener);
            sound.setBuffer(soundBuffers[type]);
            sound.setVolume(type === 'groan' ? 0.05 : 0.05);
            sound.play();
        }
    } catch(e) {}
}

function createHouseTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (type === 'wall') {
        ctx.fillStyle = '#1c150e';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#0a0705';
        for (let y = 0; y < 256; y += 16) {
            ctx.fillRect(0, y, 256, 4);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (let i = 0; i < 40; i++) {
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 30, 2);
        }
    } else if (type === 'floor') {
        ctx.fillStyle = '#14100a';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#050403';
        ctx.lineWidth = 3;
        for (let y = 0; y < 256; y += 32) {
            ctx.strokeRect(0, y, 256, 32);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// Crear armas 3D
function createFirstPersonWeapons() {
    weaponGroup = new THREE.Group();

    const w1Group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.4, metalness: 0.7 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00aa33 });
    
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.7), bodyMat);
    b1.position.set(0.22, -0.25, -0.5);
    w1Group.add(b1);

    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), coreMat);
    c1.position.set(0.22, -0.2, -0.5);
    w1Group.add(c1);

    const s1 = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16), new THREE.MeshStandardMaterial({ color: 0xd4af37 }));
    s1.position.set(0.22, 0.02, -0.65);
    w1Group.add(s1);

    const flashMat = new THREE.MeshBasicMaterial({ color: 0x00ff55, transparent: true, opacity: 0 });
    muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), flashMat);
    muzzleFlash.position.set(0.22, 0.02, -0.85);
    w1Group.add(muzzleFlash);

    const w2Group = new THREE.Group();
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.9), new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8 }));
    b2.position.set(0.22, -0.25, -0.55);
    w2Group.add(b2);

    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: 0x111, metalness: 0.9 }));
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(0.22, -0.15, -0.9);
    w2Group.add(barrel2);

    w2Group.visible = false;
    weaponGroup.add(w1Group);
    weaponGroup.add(w2Group);
    weaponParts = { 1: w1Group, 2: w2Group };

    camera.add(weaponGroup);
}

function buildHouseWorld() {
    walls.length = 0;

    const wallTex = createHouseTexture('wall');
    const floorTex = createHouseTexture('floor');

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), wallMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = 5;
    scene.add(roof);

    const l1 = new THREE.PointLight(0xa66c37, 0.6, 14); l1.position.set(-15, 4.2, -15); scene.add(l1);
    const l2 = new THREE.PointLight(0xa66c37, 0.6, 14); l2.position.set(15, 4.2, -15); scene.add(l2);
    const l3 = new THREE.PointLight(0xa66c37, 0.6, 14); l3.position.set(-15, 4.2, 15); scene.add(l3);
    const l4 = new THREE.PointLight(0xa66c37, 0.6, 14); l4.position.set(15, 4.2, 15); scene.add(l4);
    const l5 = new THREE.PointLight(0xa66c37, 0.6, 14); l5.position.set(0, 4.2, 0); scene.add(l5);

    createWall(-30, 2.5, 0, 2, 5, 60, wallMat);
    createWall(30, 2.5, 0, 2, 5, 60, wallMat);
    createWall(0, 2.5, -30, 60, 5, 2, wallMat);
    createWall(0, 2.5, 30, 60, 5, 2, wallMat);

    createWall(-15, 2.5, -10, 2, 5, 26, wallMat);
    createWall(10, 2.5, -8, 2, 5, 28, wallMat);
    createWall(-5, 2.5, 12, 2, 5, 24, wallMat);
    createWall(18, 2.5, 10, 2, 5, 22, wallMat);

    createWall(-8, 2.5, -20, 24, 5, 2, wallMat);
    createWall(8, 2.5, -15, 18, 5, 2, wallMat);
    createWall(-12, 2.5, 4, 20, 5, 2, wallMat);
    createWall(5, 2.5, 20, 22, 5, 2, wallMat);
    createWall(-18, 2.5, -2, 14, 5, 2, wallMat);
    createWall(12, 2.5, -22, 16, 5, 2, wallMat);

    spawnZombie(-24, -24);
    spawnZombie(24, -24);
    spawnZombie(-24, 24);
    spawnZombie(24, 24);
    spawnZombie(-8, -5);
    spawnZombie(10, 8);
    spawnZombie(-15, 18);
    spawnZombie(15, -15);

    spawnCollectible(25, 0.4, 25, 'ammo');
    spawnCollectible(-25, 0.4, -25, 'health');
    spawnCollectible(-5, 0.4, -2, 'ammo');
    spawnCollectible(18, 0.4, 0, 'health');

    extractionZone = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.1, 6),
        new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.7 })
    );
    extractionZone.position.set(0, 0.05, -27);
    scene.add(extractionZone);
}

function createWall(x, y, z, w, h, d, material) {
    const geom = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    walls.push({
        minX: x - w / 2, maxX: x + w / 2,
        minY: y - h / 2, maxY: y + h / 2,
        minZ: z - d / 2, maxZ: z + d / 2
    });
}

function spawnBloodEffect(position) {
    const particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });

    for (let i = 0; i < 12; i++) {
        const p = new THREE.Mesh(particleGeo, particleMat);
        p.position.copy(position);
        scene.add(p);

        bloodParticles.push({
            mesh: p,
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 3 + 1,
                (Math.random() - 0.5) * 4
            ),
            life: 0.6
        });
    }
}

function flashZombieHit(zombieMesh) {
    zombieMesh.traverse((child) => {
        if (child.isMesh && child.material && child.material.emissive) {
            const origEmissive = child.material.emissive.getHex();
            child.material.emissive.setHex(0x881111);
            setTimeout(() => {
                if (child.material) child.material.emissive.setHex(origEmissive);
            }, 100);
        }
    });
}

function spawnZombie(x, z) {
    gltfLoader.load(
        'models/scene.gltf',
        (gltf) => {
            const zombieModel = gltf.scene;
            zombieModel.scale.set(1.2, 1.2, 1.2);
            zombieModel.position.set(x, 0, z);

            zombieModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.roughness = 0.6;
                        child.material.metalness = 0.1;
                        child.material.needsUpdate = true;
                    }
                }
            });

            if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(zombieModel);
                const action = mixer.clipAction(gltf.animations[0]);
                action.play();
                mixers.push(mixer);
            }

            scene.add(zombieModel);
            zombies.push({
                mesh: zombieModel,
                health: 2,
                speed: 3.8,
                detectionRange: 18
            });
            updateZombiesCounter();
        },
        undefined,
        (error) => {
            console.error('Error cargando el zombi:', error);
        }
    );
}

function spawnCollectible(x, y, z, type) {
    const geom = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const color = type === 'ammo' ? 0xf1c40f : 0xe74c3c;
    const mat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.4, emissive: color, emissiveIntensity: 0.2 });
    const box = new THREE.Mesh(geom, mat);
    box.position.set(x, y, z);
    scene.add(box);
    collectibles.push({ mesh: box, type: type });
}

function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        if (!controls.isLocked) return;
        switch (e.code) {
            case 'KeyW': moveForward = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyD': moveRight = true; break;
            case 'ShiftLeft': case 'ShiftRight': isRunning = true; break;
            case 'KeyF':
                flashlightOn = !flashlightOn;
                flashlight.intensity = flashlightOn ? 4.5 : 0;
                break;
            case 'KeyR':
                reloadWeapon();
                break;
            case 'Digit1':
                currentWeaponId = 1;
                switchWeapon(1);
                break;
            case 'Digit2':
                currentWeaponId = 2;
                switchWeapon(2);
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyD': moveRight = false; break;
            case 'ShiftLeft': case 'ShiftRight': isRunning = false; break;
        }
    });

    window.addEventListener('mousedown', (e) => {
        if (controls.isLocked && e.button === 0) {
            shootWeapon();
        }
    });
}

function switchWeapon(id) {
    currentWeaponId = id;
    Object.keys(weaponParts).forEach(key => {
        weaponParts[key].visible = (Number(key) === id);
    });
    document.querySelectorAll('.weapon-slot').forEach((slot, idx) => {
        slot.classList.toggle('active', idx + 1 === id);
    });
    updateHUD();
}

function reloadWeapon() {
    if (isReloading) return;

    const maxClip = clipSize[currentWeaponId];
    const currentClip = ammo[currentWeaponId];
    const reserve = reserveAmmo[currentWeaponId];

    if (currentClip >= maxClip) {
        showNotification("¡Cargador lleno!");
        return;
    }

    if (reserve <= 0) {
        showNotification("¡Sin munición de reserva!");
        return;
    }

    isReloading = true;
    showNotification("Recargando...");

    // 🔊 Reproducir sonido de recarga sintetizado al instante
    playSound('reload');

    if (weaponGroup) {
        weaponGroup.position.y = -0.15;
    }

    setTimeout(() => {
        const needed = maxClip - currentClip;
        if (reserve >= needed) {
            ammo[currentWeaponId] += needed;
            reserveAmmo[currentWeaponId] -= needed;
        } else {
            ammo[currentWeaponId] += reserve;
            reserveAmmo[currentWeaponId] = 0;
        }

        updateHUD();
        if (weaponGroup) {
            weaponGroup.position.y = 0;
        }
        isReloading = false;
        showNotification("¡Arma lista!");
    }, 1000);
}

function shootWeapon() {
    if (isReloading) return;

    if (ammo[currentWeaponId] <= 0) {
        showNotification("¡Cargador vacío! Presiona [R] para recargar.");
        return;
    }

    ammo[currentWeaponId]--;
    updateHUD();
    
    playSound(currentWeaponId === 1 ? 'shoot1' : 'shoot2');

    if (weaponGroup) {
        weaponGroup.position.z = 0.08;
        setTimeout(() => { if (weaponGroup) weaponGroup.position.z = 0; }, 80);
    }

    if (muzzleFlash) {
        muzzleFlash.material.opacity = 1;
        setTimeout(() => { muzzleFlash.material.opacity = 0; }, 70);
    }

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const zombieMeshes = zombies.map(z => z.mesh);
    const intersects = raycaster.intersectObjects(zombieMeshes, true);

    if (intersects.length > 0) {
        let hitObj = intersects[0].object;
        let hitPoint = intersects[0].point;
        let zombieObj = null;

        let current = hitObj;
        while (current && !zombieObj) {
            zombieObj = zombies.find(z => z.mesh === current);
            current = current.parent;
        }

        if (!zombieObj && zombies.length > 0) {
            zombieObj = zombies[0]; 
        }

        if (zombieObj && zombieObj.health > 0) {
            spawnBloodEffect(hitPoint);
            flashZombieHit(zombieObj.mesh);
            zombieObj.health--;

            if (zombieObj.health <= 0) {
                zombiesKilled++;
                scene.remove(zombieObj.mesh);
                zombies = zombies.filter(z => z !== zombieObj);
                updateZombiesCounter();
                showNotification("¡Zombi eliminado!");
            } else {
                showNotification("¡Impacto crítico! Falta 1 disparo.");
            }
        }
    }
}

function checkWallCollision(nextX, nextZ) {
    const radius = 0.6;
    const playerY = camera.position.y;
    for (let w of walls) {
        if (playerY > w.minY - 0.5 && playerY < w.maxY + 1.0) {
            if (nextX + radius > w.minX && nextX - radius < w.maxX &&
                nextZ + radius > w.minZ && nextZ - radius < w.maxZ) {
                return true;
            }
        }
    }
    return false;
}

function showNotification(text) {
    const notif = document.getElementById('notification');
    notif.innerText = text;
    setTimeout(() => {
        if (notif.innerText === text) notif.innerText = '';
    }, 2500);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function updateHUD() {
    const current = ammo[currentWeaponId];
    const reserve = reserveAmmo[currentWeaponId];
    document.getElementById('ammo-count').innerText = `${current} / ${reserve}`;
}

function updateZombiesCounter() {
    document.getElementById('zombies-left').innerText = zombies.length;
}

function updateHealthVisuals() {
    const fill = document.getElementById('health-bar-fill');
    fill.style.width = `${(health / maxHealth) * 100}%`;
    fill.style.backgroundColor = health === 1 ? '#e74c3c' : '#2ecc71';
    document.getElementById('health-text').innerText = `${health} / ${maxHealth}`;

    const vignette = document.getElementById('low-health-vignette');
    if (health === 1) {
        vignette.classList.add('critical-pulse');
    } else {
        vignette.classList.remove('critical-pulse');
        vignette.style.opacity = '0';
    }
}

function takeDamage() {
    if (isInvulnerable || isGameOver) return;

    health--;
    isInvulnerable = true;

    const overlay = document.getElementById('damage-overlay');
    overlay.style.opacity = '1';
    setTimeout(() => { overlay.style.opacity = '0'; }, 300);

    updateHealthVisuals();

    if (health <= 0) {
        isGameOver = true;
        document.getElementById('gameover-stats').innerText = `Sobreviviste ${formatTime(elapsedTime)} | Zombis eliminados: ${zombiesKilled}`;
        document.getElementById('game-over-screen').classList.remove('hidden');
        controls.unlock();
    } else {
        setTimeout(() => { isInvulnerable = false; }, 1200);
    }
}

function showVictoryScreen() {
    isVictory = true;
    const totalAmmo = ammo[1] + ammo[2] + reserveAmmo[1] + reserveAmmo[2];
    const score = Math.max(0, (zombiesKilled * 200) + (health * 300) + (totalAmmo * 10) - Math.floor(elapsedTime * 2));
    
    let rank = 'C';
    if (score >= 2200) rank = 'S (SUPERVIVIENTE ÉLITE)';
    else if (score >= 1600) rank = 'A (VETERANO)';
    else if (score >= 1000) rank = 'B (SOLDADO)';

    document.getElementById('victory-stats').innerHTML = `
        <strong>TIEMPO DE EXTRACCIÓN:</strong> ${formatTime(elapsedTime)}<br>
        <strong>ZOMBIS ELIMINADOS:</strong> ${zombiesKilled}<br>
        <strong>SALUD RESTANTE:</strong> ${health} / ${maxHealth}<br>
        <strong>PUNTUACIÓN TOTAL:</strong> ${score} pts<br>
        <strong>RANGO FINAL:</strong> <span style="color:#2ecc71; font-weight:bold;">${rank}</span>
    `;
    document.getElementById('victory-screen').classList.remove('hidden');
    controls.unlock();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    mixers.forEach(mixer => mixer.update(delta));

    for (let i = bloodParticles.length - 1; i >= 0; i--) {
        const bp = bloodParticles[i];
        bp.life -= delta;
        bp.vel.y -= 9.8 * delta;
        bp.mesh.position.addScaledVector(bp.vel, delta);

        if (bp.life <= 0) {
            scene.remove(bp.mesh);
            bloodParticles.splice(i, 1);
        }
    }

    collectibles.forEach(item => {
        item.mesh.rotation.y += 2.0 * delta;
    });

    if (controls.isLocked && !isGameOver && !isVictory) {
        elapsedTime += delta;
        document.getElementById('timer-display').innerText = formatTime(elapsedTime);

        // 🔊 Lógica del latido del corazón (cuando tienes 1 de vida, es decir, 1/3 de tu vida máxima)
        if (health <= 1) {
            heartbeatTimer += delta;
            if (heartbeatTimer > 0.9) {
                playSound('heartbeat');
                heartbeatTimer = 0;
            }
        } else {
            heartbeatTimer = 0;
        }

        if (flashlightOn && Math.random() < 0.015) {
            flashlight.intensity = 1.5;
            setTimeout(() => { if (flashlightOn) flashlight.intensity = 4.5; }, 60);
        }

        let closestDist = 999;
        zombies.forEach(z => {
            const d = z.mesh.position.distanceTo(camera.position);
            if (d < closestDist) closestDist = d;
        });

        const groanInterval = closestDist < 12 ? 4.0 : 10.0;
        ambientSoundTimer += delta;
        if (ambientSoundTimer > groanInterval && zombies.length > 0) {
            playSound('groan');
            ambientSoundTimer = 0;
        }

        hordeSpawnTimer += delta;
        if (hordeSpawnTimer > 25.0 && zombies.length < 10) {
            const corners = [[-24, -24], [24, -24], [-24, 24], [24, 24]];
            const randomCorner = corners[Math.floor(Math.random() * corners.length)];
            spawnZombie(randomCorner[0], randomCorner[1]);
            showNotification("¡Se escuchan pasos en la oscuridad!");
            hordeSpawnTimer = 0;
        }

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = isRunning ? 9.0 : 5.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * 12.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * 12.0 * delta;

        const prevX = camera.position.x;
        const prevZ = camera.position.z;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        if (checkWallCollision(camera.position.x, camera.position.z)) {
            camera.position.x = prevX;
            camera.position.z = prevZ;
        }

        if (moveForward || moveBackward || moveLeft || moveRight) {
            if (weaponGroup) {
                weaponGroup.position.y = Math.sin(Date.now() * 0.018) * 0.025;
            }
        }

        const playerPos = camera.position;
        zombies.forEach(zombie => {
            const distance3D = zombie.mesh.position.distanceTo(playerPos);
            if (distance3D < zombie.detectionRange) {
                const prevZombieX = zombie.mesh.position.x;
                const prevZombieZ = zombie.mesh.position.z;

                zombie.speed = 5.2; 
                zombie.mesh.lookAt(playerPos.x, zombie.mesh.position.y, playerPos.z);
                zombie.mesh.translateZ(zombie.speed * delta);

                if (checkWallCollision(zombie.mesh.position.x, zombie.mesh.position.z)) {
                    zombie.mesh.position.x = prevZombieX;
                    zombie.mesh.position.z = prevZombieZ;
                }
            } else {
                zombie.speed = 2.0;
            }

            const dx = zombie.mesh.position.x - playerPos.x;
            const dz = zombie.mesh.position.z - playerPos.z;
            const distanceXZ = Math.sqrt(dx * dx + dz * dz);

            if (distanceXZ < 1.2 && Math.abs(zombie.mesh.position.y - playerPos.y) < 2.0) {
                takeDamage();
            }
        });

        collectibles.forEach((item, index) => {
            if (playerPos.distanceTo(item.mesh.position) < 1.6) {
                if (item.type === 'ammo') {
                    reserveAmmo[1] += 15;
                    reserveAmmo[2] += 6;
                    showNotification("¡Munición de reserva recogida (+15 / +6)!");
                } else if (item.type === 'health') {
                    if (health < maxHealth) {
                        health++;
                        updateHealthVisuals();
                    }
                    showNotification("¡Botiquín aplicado (+1 de salud)!");
                }
                scene.remove(item.mesh);
                collectibles.splice(index, 1);
                updateHUD();
            }
        });

        if (extractionZone && playerPos.distanceTo(extractionZone.position) < 3.2) {
            showVictoryScreen();
        }
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}