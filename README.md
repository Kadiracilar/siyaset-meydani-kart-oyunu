# Siyaset Meydanı - Kart Oyunu Çekirdek Tasarım (GDD)

Bu proje, toplumu şekillendiren 3 büyük güç odağının (Devlet, Medya ve Sanat) ulusal gündemi kendi lehlerine çevirmek ve kamuoyunu yönlendirmek için girdiği hızlı, rekabetçi ve absürt savaşı konu alan hibrit (dijital ve fiziksel) bir kart oyunudur.

---

## 🏛️ 1. MÜKEMMEL "3'LÜ SİMETRİ" KURALI

Oyundaki tüm ana bileşenler sadece **3 Renk Grubu** üzerinden birbirine bağlanır. Bu sayede oyunu öğrenmek ve oynamak son derece kolaydır:

*   🔴 **Kırmızı (Siyasi) Grup:** Devlet Gücü, Bürokrasi ve Resmi Otorite.
*   🔵 **Mavi (Toplumsal) Grup:** Sivil Toplum, Medya, Gazeteciler ve Sendikalar.
*   🟡 **Sarı (Kültürel) Grup:** Sanatçılar, Akademisyenler ve Sosyal Medya Gücü.

### Sinerjiler ve Eşleşmeler
1.  **3 Karakter (Arketip) Türü:** 🔴 Devlet | 🔵 Medya | 🟡 Sanatçı
2.  **3 Gündem (Hedef) Türü:** 🔴 Siyasi | 🔵 Toplumsal | 🟡 Kültürel
3.  **3 Argüman (Oyuncu Kartı) Rengi:** 🔴 Kırmızı | 🔵 Mavi | 🟡 Sarı
4.  **3 Tur Enerjisi:** Her oyuncunun tur başına kart oynamak için **3 Enerjisi** vardır.

*   **Altın Eşleşme Kuralı:** Oynadığın kartın rengi ➔ Ortadaki Gündemin rengiyle eşleşiyorsa ➔ **+1 Güç Uyum Bonusu** kazanırsın.

---

## 🔄 2. OYNANIŞ DÖNGÜSÜ VE KURALLAR

### A. Kurulum (Setup)
*   Her oyuncu 1 adet **Arketip** kartı seçer ve önüne koyar.
*   Her oyuncuya Argüman destesinden **5 kart** dağıtılır. (Masaüstü versiyonda en az 1 PR/Defuse kartı olması garanti edilir).
*   Her oyuncu oyuna **0 Puan** ile başlar.
*   Ortaya Gündem destesinden en üstteki **1 adet Gündem Kartı** açılır.

### B. Oyuncu Turu (Turn Steps)
1.  **Enerji Yenileme:** Oyuncunun **3 Enerjisi** yenilenir.
2.  **Kart Oynama Aşaması:** Oyuncu elindeki kartları Enerji bütçesine göre oynar.
    *   Kartları ortadaki aktif Gündem kartının üzerine oynayarak oradaki gücü artırabilir.
    *   Renk uyumu varsa kartın gücü $+1$ artar.
3.  **Çözüm Kontrolü:** Eğer masadaki Gündem kartının altındaki toplam güç, o kartın **Barajına (CE)** ulaşırsa kart çözülür. Son vuruşu yapan oyuncu kartı kazanır. Kart çöpe gider, anında desteden **yeni bir Gündem** açılır. (Oyuncunun enerjisi kaldıysa yeni karta da oynayabilir).
4.  **Tur Sonu ve Kart Çekme:** Oyuncu "Tur Bitti" der ve desteden **1 kart çeker**. (Bu sırada elinde her an bir reaksiyon/savunma kartı tutabilir).

### C. Reaksiyon Sistemi (Masaüstü Uyumlu)
*   `[⚫ Siyah] Nope / Sabotaj` kartları kendi sıranızda oynanmaz, elde gizli tutulur.
*   Rakip kendi sırasındayken bir hamle yaptığında, elinizden bu kartı atarak rakibin hamlesini **anında iptal edebilir / bozabilirsiniz.**

---

## 🏆 3. PUANLAMA VE KAZANMA KOŞULLARI

### A. 0'dan 50+1'e Yarış
*   Oyunda bir "terazi/tahterevalli" yoktur. Her oyuncu oyuna **0 Puan** ile başlar.
*   Kazanılan puanlar doğrudan oyuncuların kendi kişisel hanesine eklenir ve birikir (Skorlar kalıcıdır).
*   Kişisel skorunu **50+1 Kamuoyu Puanına** (Salt Çoğunluk) ilk ulaştıran oyuncu oyunu anında kazanır.
*   Gündem destesi tamamen bittiğinde kimin puanı en yüksekse o kazanır.

### B. Arketip Uyumu (Sinerji Bonusu)
*   **Zıt Renk Kazanımı:** Kazandığın Gündem rengi karakterinin rengiyle **aynı değilse** ➔ Gündemin **Temel Puanını** alırsın.
*   **Uyumlu Renk Kazanımı:** Kazandığın Gündem rengi karakterinin rengiyle **aynıysa** ➔ Gündemin **Temel Puanı + 2 Ekstra Sinerji Puanı** alırsın! (Örn: Kültürel karaktersiniz ve kültürel gündem çözdünüz, $+2$ bonus kazanırsınız).

---

## 📈 4. YAZISIZ (DİLSİZ) KART TASARIMI

Baskı maliyetini düşürmek ve dil engelini kaldırmak için kartlarda uzun yazılar bulunmaz:
*   **Argüman Kartları:** Sadece kocaman bir rakam ve renk (🔴, 🔵, 🟡) içerir.
*   **Aksiyon (Siyah ⚫) Kartları:**
    *   🚫 **Nope (İptal):** Rakibin son hamlesini anında bloke eder.
    *   📉 **Sabotaj:** Ortadaki gündemin toplam gücünü düşürür.
    *   🔄 **Gündem Değiştir:** Mevcut gündemi çöpe atıp desteden yeni gündem açar.

---

## ⚠️ 5. KİLİTLEYİCİ KRİZ DİNAMİKLERİ

Gündem destesinden bir Kriz kartı çıktığında normal tartışmalar durur. Bu kriz çözülene veya süresi dolana kadar yeni bir normal gündem kartı açılamaz:

### 1. "Çamur At İzi Kalsın" (Eşik: 8 AG)
*   **Çözüm Ödülü:** Çözen kişi kendi puan kazanmaz. Masadaki **istediği herhangi bir rakibin puanını doğrudan -10 puan düşürür.** (Lideri aşağı çekme mekaniği).

### 2. "Çiçek Sulama İfşası" (Eşik: 12 AG - Tur Sınırı)
*   Bu kriz kartı açıldığı turun sonuna kadar çözülmek zorundadır.
*   **Çözülürse:** Çözen oyuncu absürt bir savunmayla sıyrıldığı için **+5 Puan** alır, rakipleri ise bu savunmaya maruz kaldığı için **-5 Puan** kaybeder.
*   **Çözülemezse:** Skandalı tüm siyasiler görmezden geldiği için **bütün oyuncular anında -7 Puan kaybeder.**
