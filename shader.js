// Animated WebGL background: domain-warped fractal noise in the site's palette.
(() => {
  const canvas = document.createElement("canvas");
  canvas.className = "bg-shader";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return; // CSS gradient remains as fallback
  document.body.prepend(canvas);
  document.documentElement.classList.add("has-shader");

  const vert = `
    attribute vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }
  `;

  const frag = `
    precision mediump float;
    uniform vec2  uRes;
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uScroll;
    uniform vec3  uBg, uA, uB, uC;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.0 + 3.1; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
      p.y += uScroll * 0.6;
      float t = uTime * 0.04;

      vec2 m = (uMouse - 0.5) * 0.35;
      vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t + 5.2));
      vec2 r = vec2(fbm(p * 1.2 + 2.0 * q + vec2(1.7, 9.2) + t * 1.5 + m),
                    fbm(p * 1.2 + 2.0 * q + vec2(8.3, 2.8) - t * 1.2 - m));
      float f = fbm(p * 1.1 + 2.5 * r);

      vec3 col = uBg;
      col = mix(col, uA, smoothstep(0.35, 0.95, f) * 0.85);
      col = mix(col, uB, smoothstep(0.55, 1.0, length(q)) * 0.45);
      col = mix(col, uC, smoothstep(0.6, 1.1, r.x) * 0.35);

      // keep the edges calm so text stays readable
      float vig = smoothstep(1.25, 0.2, length(uv - vec2(0.55, 0.6)));
      col = mix(uBg, col, 0.35 + 0.65 * vig);

      // fine grain to avoid banding
      col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.015;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn("Shader disabled:", e);
    canvas.remove();
    document.documentElement.classList.remove("has-shader");
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const uRes = U("uRes"), uTime = U("uTime"), uMouse = U("uMouse"), uScroll = U("uScroll");
  const uBg = U("uBg"), uA = U("uA"), uB = U("uB"), uC = U("uC");

  const palettes = {
    dark:  { bg: [0.039, 0.039, 0.039], a: [0.36, 0.11, 0.02], b: [0.16, 0.06, 0.02], c: [0.85, 0.32, 0.06] },
    light: { bg: [0.965, 0.957, 0.937], a: [0.99, 0.75, 0.58], b: [0.93, 0.86, 0.78], c: [1.00, 0.59, 0.36] },
  };
  const root = document.documentElement;
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const setPalette = () => {
    const pal = palettes[isDark() ? "dark" : "light"];
    gl.uniform3fv(uBg, pal.bg); gl.uniform3fv(uA, pal.a); gl.uniform3fv(uB, pal.b); gl.uniform3fv(uC, pal.c);
  };
  setPalette();
  new MutationObserver(() => { setPalette(); if (reduce) draw(); })
    .observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  const SCALE = 0.5; // render at half resolution, upscaled by CSS
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(innerWidth * dpr * SCALE));
    canvas.height = Math.max(1, Math.floor(innerHeight * dpr * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  };
  addEventListener("resize", () => { resize(); if (reduce) draw(); });
  resize();

  let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5;
  addEventListener("pointermove", e => { tx = e.clientX / innerWidth; ty = 1 - e.clientY / innerHeight; }, { passive: true });

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  let raf = 0;
  const draw = () => {
    mx += (tx - mx) * 0.03; my += (ty - my) * 0.03;
    gl.uniform1f(uTime, reduce ? 20 : (performance.now() - t0) / 1000);
    gl.uniform2f(uMouse, mx, my);
    gl.uniform1f(uScroll, scrollY / Math.max(1, document.body.scrollHeight));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = () => { draw(); raf = requestAnimationFrame(loop); };

  if (reduce) {
    draw();
    addEventListener("scroll", draw, { passive: true });
  } else {
    loop();
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) loop();
    });
  }
})();
