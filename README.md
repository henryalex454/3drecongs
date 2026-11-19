# 3Drecon Studio v3.0 — Mobil 3D Tarayıcı & Birleşik TSDF Mesh Motoru

> **⬇ [En Güncel APK'yı İndir — 3Drecon-latest.apk (GitHub Release)](https://github.com/henryalex454/3drecongs/releases/latest/download/3Drecon-latest.apk)**  
> **⬇ [Alternatif Doğrudan Bağlantı — dist/3Drecon-latest.apk](https://github.com/henryalex454/3drecongs/raw/main/dist/3Drecon-latest.apk)**  
> *(Bu bağlantılar her `main` güncellemesinde GitHub Actions tarafından otomatik olarak en güncel derlemeyle tazelenir.)*

**Kaynak taban:** [`iskenderozkul/3Drecon`](https://github.com/iskenderozkul/3Drecon)  
**Hedef depo:** [`henryalex454/3drecongs`](https://github.com/henryalex454/3drecongs)  
**Platform:** Android APK (Capacitor + WebGL2) · Mobil PWA (Android Chrome & iOS Safari) · Masaüstü Web

---

## v3.0 ile Çözülen Temel Sorunlar

### 1. Üst Üste Binmeyen, Adacıksız, Pürüzsüz Tek Parça Mesh (Birleşik TSDF + Surface Nets)
- **Tek Dünya-Uzayı TSDF Voxel Hacmi (`8×8×8` blok hash):** Önceki yaklaşımlarda farklı kamera açılarından gelen yamaların üst üste binmesi veya kopuk adacıklar oluşturması engellendi. Her dünya noktası tek bir `tsdf[voxel]` sıfır-geçiş yüzeyinde birleştirilir; aynı duvara kaç farklı açıdan bakılırsa bakılsın tek bir sürekli yüzey güncellenir.
- **Voxel Merkezli Frustum Projeksiyonu ve Boşluk Oyma (Free-Space Carving):** Kamera görüş alanındaki tüm aktif voxeller kenar-korumalı derinlik tamponuna (`44×32`) projekte edilir; havada asılı gürültü ve hayalet yüzeyler otomatik oyularak temizlenir.
- **Sızdırmaz Komşu Blok Sınırı + Taubin (`λ = 0.50`, `μ = -0.53`) Yumuşatma:** `[-1..8]` ortak sınır ızgarası ile komşu `8×8×8` bloklar çatlak veya çift üçgen bırakmadan birleşir. Blok sınır köşeleri kilitlenerek uygulanan büzülmesiz Taubin yumuşatması (0–6 geçiş ayarlı) köşeleri eritmeden dalgalanmaları giderir.

### 2. Yan Odaya Geçince Duvar Arkasından Görme (X-Ray Sızması) Çözümü
- **Donanımsal Derinlik Oklüzyonu (`depthTest`) + Tek Yönlü Yüzey (`FrontSide`):** Mesh yüzeyleri ve 3B anchorlar artık derinlik testi kapalı şekilde çizilmez.
- **Oda / Kapı Eşiği Portal Görüş Hattı Elemesi:** **Oda 1** taranıp **Oda 2**'ye geçildiğinde bölme duvarının arkasında kalan Oda 1 blokları ve anchorları otomatik gizlenir. Alt kontrol çubuğundaki **Oklüzyon** düğmesiyle anlık açık/kapalı karşılaştırma yapılabilir.

### 3. Aynalı / Parlak Yüzey Koruması ve Makro Derinlik (8–45 cm)
- **Ayna Koruma (Mirror Guard):** Yüksek parlaklık ve yansıma gösteren ayna/cam bölgeleri algılanarak sanal derinlik patlaması reddedilir ve yüzey çevre çerçeve düzlemine kilitlenir.
- **Makro Yakın Çekim Modu:** Minimum derinlik sınırı 25 cm'den **8 cm**'ye indirildi. Yakın nesneler (`8–45 cm`) için **Makro 1.5 cm** ince TSDF voxel çözünürlüğü ile obje kenar ve hacim detayları korunur.
- **Canlı PiP Önizlemeler:** Sağ üst köşede gerçek zamanlı **Derinlik (Turbo ısı haritası)** ve **Ayna / Güven** maskesi izlenebilir.

### 4. Sorunsuz 3B Anchorlar ve Gerçek Mesafe Ölçümü
- Anchorlar boşluğa değil yalnızca gerçek yüzey normaline hizalı olarak kilitlenir.
- Duvar arkasına düşen anchorlar sahnede gizlenir ve listede **Duvar Arkasında (Gizli)** olarak işaretlenir.
- İki veya daha fazla anchor yerleştirildiğinde aralarındaki **gerçek 3B Öklid mesafesi (`m` / `cm`) ve yükseklik farkı (`ΔY`)** otomatik hesaplanır; tek dokunuşla ilgili anchora kamera uçuşu yapılabilir.

---

## Görünüm ve Meshleme Türleri

Alt kontrol çubuğundan tek dokunuşla tüm görünüm ve meshleme modları seçilebilir:

| Mod | Açıklama |
|---|---|
| **AR** | Gerçek oda / canlı arka kamera görüntüsü üzerinde yarı saydam birleşik TSDF yüzeyi |
| **Mesh** | Fiziksel rengi gizleyip yalnızca pürüzsüzleştirilmiş 3B TSDF geometriyi gösterir (duvar oklüzyonu korunur) |
| **AR+Tel** | Yarı saydam yüzey + temiz dörtgen/üçgen topoloji tel kafesi |
| **Tel Kafes** | Saf tel kafes (wireframe) topoloji görünümü |
| **Normal** | Dünya uzayı yüzey normalleri (RGB tanılama haritası) |
| **Derinlik** | Kameraya göre canlı Turbo ters-derinlik ısı haritası |
| **Nokta** | TSDF sıfır-geçiş noktalarından üretilen yoğun nokta bulutu |

**Meshleme Algoritmaları:**
- **Surface Nets (Pürüzsüz):** Paylaşımlı köşe + büzülmesiz Taubin yumuşatma.
- **Bloklu MC (Ham İzo-Yüzey):** Yumuşatmasız düz üçgenlerle ham TSDF doğruluğu incelemesi.

**Voxel Çözünürlükleri:** `Hızlı 9cm` · `Dengeli 6cm` · `İnce 3.5cm` · `Makro 1.5cm`

---

## Hazır Kullanım Senaryoları

**Motor / Senaryolar** menüsünden tek dokunuşla seçilebilir:
1. **Çoklu Oda & Duvar Oklüzyonu:** Oda 1 → Kapı Eşiği → Oda 2 geçişinde sıfır duvar sızması testi.
2. **Aynalı & Parlak Yüzey Tarama:** Ayna önünde Mirror Guard açık/kapalı karşılaştırması.
3. **Makro Yakın Çekim (8–45 cm):** Masa üzerindeki mikro nesnelerde yakın alan taraması.
4. **Ölçüm & Anchor Planlama:** Yüzey kilitli anchorlarla gerçek 3B mesafe ve kot farkı ölçümü.

---

## Mobil, PWA ve Otomatik Android APK Derleme

### Otomatik GitHub Actions APK Hattı
Bu depo, `.github/workflows/build-apk.yml` iş akışı ile her `main` push'unda:
1. Vite üretim paketini (`dist/`) derler,
2. Capacitor Android projesini oluşturur ve kamera izinlerini (`CAMERA`, `INTERNET`) otomatik enjekte eder,
3. Gradle ile `3Drecon-latest.apk` dosyasını derler,
4. `dist/3Drecon-latest.apk` dosyasını ve GitHub **Latest Release** bağlantısını otomatik olarak tazeler.

### Yerel Geliştirme ve Manuel APK Derleme
```bash
# 1. Bağımlılıkları kurun ve web uygulamasını çalıştırın
npm install
npm run dev

# 2. Üretim derlemesi + Android APK (Capacitor + JDK 17 + Android SDK)
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
# Çıktı: android/app/build/outputs/apk/debug/app-debug.apk
```

### Dışa Aktarım ve Native C++/GLSL Yaması
Uygulama içindeki **Aktar/APK** menüsünden:
- **`.OBJ`** (pürüzsüz normalli mesh),
- **`.PLY`** (renkli 3B yüzey/nokta bulutu),
- **`3drecon-v3-android-cpp-apk-kit.txt`** (orijinal `iskenderozkul/3Drecon` C++ Taubin + OpenGL ES 3.0 `u_LiveDepthTex` duvar oklüzyon shader yaması)
doğrudan indirilebilir.
