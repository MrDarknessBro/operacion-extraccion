# 🧟 Operación Extracción - Juego de Terror 3D (PS1 Style)

Proyecto final desarrollado para la evaluación T3 de Computación Gráfica. Un videojuego de disparos en primera persona (FPS) ambientado en un laberinto oscuro con estética retro inspirada en la era de la primera PlayStation (PS1), implementado con gráficos 3D en tiempo real y audio procedural.

---

## 🎮 Descripción del Juego
Eres un soldado atrapado en un laberinto infectado de zombis. Tu objetivo es navegar por los pasillos oscuros, gestionar tus recursos de munición y salud, eliminar a las amenazas y encontrar la zona de extracción antes de que sea demasiado tarde. Cuenta con sistema de puntuación por rangos y una atmósfera de terror inmersiva.

---

## 🕹️ Controles

| Tecla / Acción | Descripción |
| :--- | :--- |
| **W, A, S, D** | Moverse por el laberinto |
| **Shift (Mantener)** | Correr (Sprint) |
| **Mouse** | Apuntar / Mirar alrededor |
| **Clic Izquierdo** | Disparar arma activa |
| **R** | Recargar cargador (consume munición de reserva) |
| **1 / 2** | Cambiar entre armas |
| **F** | Encender / Apagar linterna |

---

## 🛠️ Tecnologías y Stack
* **Three.js** (Motor gráfico 3D WebGL).
* **PointerLockControls** (Gestión de cámara en primera persona).
* **GLTFLoader** (Carga de modelos 3D).
* **Web Audio API** (Sintetizador nativo para efectos de sonido procedurales: pasos, disparos, recargas e impactos).
* **HTML5 Canvas & CSS3** (Interfaz de usuario HUD y pantallas de victoria/derrota).

---

## 🚀 Instalación y Ejecución Local

Debido a las políticas de seguridad de los navegadores al cargar modelos 3D, el proyecto **requiere un servidor local**:

1. Clona o descarga este repositorio.
2. Abre la carpeta del proyecto en **Visual Studio Code**.
3. Utiliza la extensión **Live Server**.
4. Haz clic en **"Go Live"** para abrir el juego en tu navegador.