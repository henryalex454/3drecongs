import type { EngineConfig } from '../types/recon';

/**
 * Builds a comprehensive v3.0 upgrade & APK packaging kit for iskenderozkul/3Drecon:
 * 1) C++ Taubin (lambda/mu) non-shrinking smoother + Mirror Plane Clamper + 8cm Macro depth gate
 * 2) OpenGL ES 3.0 Hardware Depth-Occlusion shader (stops seeing Room 1 mesh/anchors through Room 2 walls)
 * 3) Capacitor / TWA Android APK packaging configuration for this mobile web app
 */
export function generateAndroidApkPatchKit(config: EngineConfig): string {
  return `# 3Drecon v3.0 — Android Native Patch & APK Paketleme Kiti
# Kaynak Repo: https://github.com/iskenderozkul/3Drecon
# Oluşturulma: ${new Date().toISOString()}
# Aktif Motor Profili: Taubin=${config.taubinPasses} geçiş, Duvar Oklüzyonu=${config.wallOcclusion ? 'AÇIK' : 'KAPALI'}, Ayna Koruma=${config.mirrorGuard ? 'AÇIK' : 'KAPALI'}, Makro=${config.macroMode ? 'AÇIK (8cm)' : 'STANDART'}

========================================================================
1. C++ MOTOR YAMASI — Hızlı Taubin Mesh + Ayna Koruma + 8cm Makro
   Hedef: app/src/main/cpp/mesh/mesher.cpp & core/engine.cpp
========================================================================

// Non-shrinking Taubin smoothing (lambda = 0.50, mu = -0.53)
// Marching Cubes / Tango3DR çıkışı üzerinde köşeleri eritmeden pürüzsüzleştirir.
void applyTaubinSmoothing(
    std::vector<Vertex>& vertices,
    const std::vector<uint32_t>& indices,
    int passes = ${config.taubinPasses},
    float lambda = 0.50f,
    float mu = -0.53f,
    float maxEdgeJumpM = 0.06f) {
  const size_t n = vertices.size();
  std::vector<std::vector<uint32_t>> adj(n);
  for (size_t i = 0; i + 2 < indices.size(); i += 3) {
    uint32_t a = indices[i], b = indices[i + 1], c = indices[i + 2];
    adj[a].push_back(b); adj[a].push_back(c);
    adj[b].push_back(a); adj[b].push_back(c);
    adj[c].push_back(a); adj[c].push_back(b);
  }
  std::vector<Vec3> tmp(n);
  auto step = [&](float factor) {
    for (size_t i = 0; i < n; ++i) {
      Vec3 sum{0, 0, 0};
      int cnt = 0;
      const Vec3& p = vertices[i].pos;
      for (uint32_t nb : adj[i]) {
        Vec3 d = vertices[nb].pos - p;
        if (dot(d, d) <= maxEdgeJumpM * maxEdgeJumpM) {
          sum += d;
          ++cnt;
        }
      }
      tmp[i] = (cnt >= 2) ? (p + sum * (factor / float(cnt))) : p;
    }
    for (size_t i = 0; i < n; ++i) vertices[i].pos = tmp[i];
  };
  for (int p = 0; p < passes; ++p) {
    step(lambda);
    step(mu);
  }
  recomputeAreaWeightedNormals(vertices, indices);
}

// Ayna / Parlak Yüzey Koruma (Mirror Guard) + Makro Derinlik Kapısı (0.08m)
// Aynadaki sanal derinlik patlamasını çevre çerçeve düzlemine kilitler.
constexpr float kMinDepthMacroM = 0.08f; // Eski 0.25m yerine 8cm makro desteği
constexpr float kMacroVoxelSizeM = 0.006f; // Yakın mesafede (< 0.45m) 6mm mikro voxel

bool clampMirrorDepthPatch(
    DepthGrid& depth,
    const uint8_t* luma,
    const uint8_t* confidence,
    const CameraIntrinsics& K) {
  // 1) Yüksek parlaklık + düşük doku gradyanı + ani derinlik sıçraması gösteren pikselleri maskele
  // 2) Maske çevresindeki güvenilir (confidence >= 160) çerçeve piksellerinden 1/z düzlemi uydur
  // 3) Ayna piksellerini sanal oda derinliği yerine bu düzleme kilitle
  return fitInverseDepthBoundaryPlane(depth, luma, confidence, K);
}

========================================================================
2. OPENGL ES 3.0 DUVAR OKLÜZYONU & ANCHOR DERİNLİK TESTİ
   Hedef: app/src/main/cpp/gl/renderer.cpp
   Çözüm: Yan odaya geçince önceki odanın mesh ve anchorlarının duvar
          arkasından görünmesini (X-ray sızması) tamamen engeller.
========================================================================

// Fragment Shader (Mesh & Anchor ortak derinlik oklüzyon kapısı)
#version 300 es
precision highp float;
uniform sampler2D u_LiveDepthTex; // ARCore 16-bit/float canlı derinlik haritası (metre)
uniform vec2 u_ViewportSize;
uniform float u_OcclusionBiasM;   // Varsayılan: 0.045 (4.5 cm tolerans)
in float v_LinearEyeDepthM;       // Kameradan mesh/anchor parçasına mesafe (metre)
in vec3 v_Color;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_ViewportSize;
  float liveWallDepthM = texture(u_LiveDepthTex, uv).r;
  // Canlı kamera derinliği bir duvarı gösteriyorsa ve bu mesh/anchor duvarın arkasındaysa ÇİZME!
  if (liveWallDepthM > 0.08 && v_LinearEyeDepthM > liveWallDepthM + u_OcclusionBiasM) {
    discard;
  }
  fragColor = vec4(v_Color, 0.78);
}

// ÖNEMLİ: drawAnchors() içinde glDisable(GL_DEPTH_TEST) KALDIRILDI!
// Artık anchor halkaları glEnable(GL_DEPTH_TEST) + u_LiveDepthTex kapısı ile çizilir,
// yüzeye 0.008m normal ofsetiyle kilitlenir ve duvar arkasından asla sızmaz.
glEnable(GL_DEPTH_TEST);
glEnable(GL_CULL_FACE);
glCullFace(GL_BACK);

========================================================================
3. MOBİL WEB UYGULAMASINI ANDROID APK OLARAK PAKETLEME (Capacitor / TWA)
========================================================================

// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iskenderozkul.recon3d',
  appName: '3Drecon Studio',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};
export default config;

// Terminal komutları (APK oluşturma):
// 1. npm run build
// 2. npx cap add android
// 3. npx cap sync android
// 4. cd android && ./gradlew assembleRelease
// -> Çıktı: android/app/build/outputs/apk/release/app-release.apk
`;
}
