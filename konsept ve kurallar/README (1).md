# 🏛️ Siyaset Meydanı - Kart Oyunu Çekirdek Tasarım (GDD)

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

## 📦 2. KUTU İÇERİĞİ VE KART DAĞILIMI (Toplam: 64 Kart)

Oyun, hem dijital veritabanında hem de fiziksel kutuda toplam **64 kart** ile oynanır ve iki ana desteye ayrılır:

### A. Gündem Destesi (14 Adet Kart)
Ortak masada sırayla açılan hedefleri ve krizleri içerir:
*   🔴 **Siyasi Gündem (4 Adet):** Baraj: 10 AG | Ödül: +10 Puan
*   🔵 **Toplumsal Gündem (4 Adet):** Baraj: 10 AG | Ödül: +10 Puan
*   🟡 **Kültürel Gündem (4 Adet):** Baraj: 10 AG | Ödül: +10 Puan
*   ⚠️ **Kriz: Çamur At İzi Kalsın (1 Adet):** Baraj: 8 AG | Ödül: Yok. Çözen kişi kendi puan kazanmaz, seçtiği bir rakipten **-10 Puan** siler.
*   🚨 **Kriz: Çiçek Sulama İfşası (1 Adet):** Baraj: 12 AG (Tur Sınırı) | Ödül/Ceza: Açıldığı turun sonuna kadar çözülmelidir. Çözen oyuncu **+5 Puan** alır, rakipleri **-5 Puan** kaybeder. Çözülemezse tüm oyuncular **-7 Puan** kaybeder.

### B. Merkez Oyuncu Destesi (44 Adet Kart)
Oyuncuların elinde tuttuğu, oynamak için Enerji harcadığı kartlardır. Yazısız/dilsiz (ikon/renk odaklı) tasarlanmıştır:
*   **1'lik Argüman Kartı (12 Adet - Her Renkten 4'er):** Maliyet: 1 Enerji | Güç: 1 AG (Renk uyumuyla 2 AG)
*   **2'lik Argüman Kartı (9 Adet - Her Renkten 3'er):** Maliyet: 1 Enerji | Güç: 2 AG (Renk uyumuyla 3 AG)
*   **3'lük Argüman Kartı (6 Adet - Her Renkten 2'şer):** Maliyet: 2 Enerji | Güç: 3 AG (Renk uyumuyla 4 AG)
*   **4'lük Argüman Kartı (3 Adet - Her Renkten 1'er):** Maliyet: 3 Enerji | Güç: 4 AG (Renk uyumuyla 5 AG)
*   🚫 **Nope (İptal - Siyah Kart - 6 Adet):** Maliyet: 0 (Anlık/Reaktif) / Gelecek Tur Cezası: -1 Enerji. Atılan son kartı iptal eder.
*   📉 **Sabotaj (Siyah Kart - 4 Adet):** Maliyet: 2 Enerji | Ortadaki gündemden 4 güç siler.
*   🔄 **Gündem Değiştir (Siyah Kart - 2 Adet):** Maliyet: 3 Enerji | Mevcut gündemi puan vermeden çöpe atar.
*   💳 **Fonlama (Siyah Kart - 2 Adet):** Maliyet: 1 Enerji | Elindeki 2 kartı çöpe (ıskartaya) fırlatır.

*Not: Geriye kalan 6 kart, asimetrik Karakter kartlarıdır.*

---

## 👥 3. ASİMETRİK KARAKTER YETENEKLERİ (6 Karakter)

Oyuncular oyun başında aşağıdaki 6 karakterden birini seçerek asimetrik avantajlar ve dezavantajlar kazanırlar:

### 🔴 Siyasi Karakterler
*   **Bürokrat:** 
    *   *Avantaj:* Turunda 1 Enerji harcayarak masadaki aktif Gündem kartının rengini o tur için kalıcı olarak değiştirebilir. 
    *   *Dezavantaj:* Bu avantajı kullanmak "Zorunlu en az 1 enerji harcama" şartını karşılamaz; turu bitirebilmek için elinden en az 1 enerji değerinde başka bir kart daha oynamalıdır. Tur sonunda kart çekebilmek için 1 Enerji ödemek zorundadır (Enerjisi kalmadıysa kart çekemez). "Fonlama" kartını kullandığında hanesinden **-1 Puan** silinir.
*   **Kolluk Kuvveti:**
    *   *Avantaj:* Masada herhangi bir oyuncu 🚫 Nope kartı attığında müdahale etmeyi seçebilir. Müdahale ederse, Nope atan oyuncunun elinden rastgele 1 kartı çöpe attırır.
    *   *Dezavantaj:* Bu müdahaleyi gerçekleştirirse kendi sonraki turuna 1 Enerji eksik (2 Enerji ile) başlar. Ayrıca, 🔵 Mavi (Toplumsal) gündem çözüldüğünde son vuruşu yapan kendisi değilse hanesinden **-2 Puan** silinir.

### 🔵 Toplumsal Karakterler
*   **Anchorman:**
    *   *Avantaj:* Yeni bir gündem kartı açılmadan önce 1 Enerji harcayarak destenin en üstündeki karta gizlice bakabilir. Beğenmezse desteyi karıştırıp yenisini çektirebilir (Maksimum 2 kez). Anchorman avantajı kullanmak istemezse gündem kartı normal açılır (Dijitalde onay ekranı gelir; masaüstünde takibi oyuncu kendisi yapar).
    *   *Dezavantaj:* Bir turda gündeme hiç kart oynamazsa hanesinden **-1 Puan** silinir (Bu ceza bir oyun partisi boyunca en fazla 5 kez yaşanabilir).
*   **Gazeteci:**
    *   *Avantaj:* Masada herhangi biri kart çöpe attığında (oynayarak veya atarak), 1 Enerji harcayarak o kartı kendi eline alabilir (Tur başına maksimum 1 kez).
    *   *Dezavantaj:* Bu hakkı kullandığı tur, tur sonunda kart çekemez. Ek olarak, 🔴 Kırmızı (Siyasi) gündem aktifken renk uyumu olmayan (Mavi veya Sarı) bir kart oynarsa o kartın gücü 1 azalır.

### 🟡 Kültürel Karakterler
*   **Aktivist Sanatçı:**
    *   *Avantaj:* Bir rakip gündem çözüp puan aldığında, elinden 1 kart atarak attığı kartın enerji maliyeti kadar o rakibin kazandığı puanı bloke edebilir (Oyun partisi boyunca maksimum 3 kez kullanılabilir).
    *   *Dezavantaj:* 🔴 Kırmızı (Siyasi) gündem aktifken herhangi bir kart oynarsa o kartın gücü 1 azalır (Bu durum bir parti boyunca en fazla 2 kez yaşanabilir, "Gözaltı Sınırı").
*   **Popüler Influencer:**
    *   *Avantaj:* Oynadığı 1'lik argüman kartları masaya bakılmaksızın her zaman +1 Uyum Bonusu alır (2 güç üretir).
    *   *Dezavantaj:* Bu avantajı kullanırsa kartın kendi maliyetine ek olarak +1 Enerji daha öder. Ayrıca, bir rakip gündemi 🔴 Kırmızı kartla çözüp kazanırsa, sessiz kaldığı için anında **-2 Puan** kaybeder.

---

## 🔄 4. OYNANIŞ VE PARTİ KURALLARI

### A. Kurulum ve Başlangıç
1.  **Deste Hazırlığı:** Merkez Oyuncu Destesi ve Gündem Destesi kendi içlerinde karıştırılır ve masaya kapalı olarak yerleştirilir.
2.  **Karakter Seçimi:** Oyuncular istedikleri sırada Karakter kartlarından birini seçer ve önüne açık koyar. Sıra anlaşmazlığını oyuncular kendi çözer; dijital versiyonda karakterler tamamen rastgele (random) dağıtılır.
3.  **Dağıtıcı (Dealer) Seçimi:** Oyun başında bir dağıtıcı belirlenir. Dağıtıcı kartları saat yönünde karıştırıp dağıtır ve her oyuncuya gizlice **5 kart** verir. Oyuna dağıtıcının solundaki oyuncu başlar.
4.  **Sıra ve Dağıtıcı Değişimi:** Ortadaki Gündem kartı her çözüldüğünde, dağıtıcılık rolü (ve dolayısıyla yeni gündeme ilk başlama sırası) saat yönünde bir sonraki oyuncuya geçer. Desteler tamamen bitmediği sürece yeniden kart dağıtımı yapılmaz, oyuncular ellerindeki kartlarla oynamaya devam eder.

### B. Oynanış Kuralları
1.  **Enerji:** Her tur oyuncunun 3 Enerjisi yenilenir.
2.  **Zorunlu Eylem:** Oyuncu kendi turunda en az 1 enerji harcamak zorundadır. Elinde oynayabileceği bir kart yoksa veya oynamak istemezse **"Gündemi Saptırma (Manevra)"** yapar: 1 Enerji harcar, elinden 1 kartı gizlice çöpe atar ve desteden yeni 1 kart çeker.
3.  **Renk Uyumu Bonusu:** Oynanan kartın rengi ortadaki Gündemle aynıysa gücü +1 artar.
4.  **Gündem Çözümü ve Sinerji:** Gündem barajına ulaşıldığında son vuruşu yapan gündemi kazanır. Karakter rengi ve Gündem rengi uyumluysa **Temel Puan + 2 Sinerji Puanı**, farklıysa sadece **Temel Puan** alınır.
5.  **Nope (İptal) Düellosu:** 🚫 Nope kartı reaktif olarak anlık atılır. Nope atan oyuncu bir sonraki turuna 1 eksik enerjiyle (2 enerji) başlar. Kendisine Nope atılan oyuncu elinden başka bir Nope ile kendini savunursa bu enerji cezasını almaz. Nope zincirine araya girerek sonradan dahil olan (üçüncü şahıs) oyuncular cezayı öder.

---

## 🏆 5. KAZANMA VE DESTE BİTME (TASFİYE) KURALLARI

### A. Kesin Kazanma Koşulu
*   Skorunu **50+1 Kamuoyu Puanına** ulaştıran oyuncu oyunun o partisini kesin olarak kazanmış olur.
*   50+1 sağlandığında o parti biter, tüm karakter kartları toplanıp yeniden dağıtılarak yeni parti başlatılır.

### B. Deste Bitme ve Tasfiye Protokolü
Eğer Merkez Oyuncu Destesi veya Gündem Destesi bir oyuncu 50+1 puana ulaşmadan önce tamamen biterse şu adımlar sırasıyla uygulanır:
1.  Oyun durmaz; **"Tasfiye Safhası"** başlar.
2.  Sırası gelen oyuncular sırayla 1 Enerji harcayarak elinden herhangi 1 kartı kapalı şekilde çöpe fırlatır (Deste bittiği için yeni kart çekilmez).
3.  Masadaki hiçbir oyuncunun elinde kart kalmayana kadar bu el boşaltma döngüsü saat yönünde devam eder.
4.  Herkesin eli tamamen sıfırlandığında, ortadaki aktif gündem kartı (tasfiye öncesinde veya tasfiye sırasında baraj puanına ulaşılmış ya da baraj geçilmiş olsa dahi) geçersiz sayılır ve hiç kimseye puan verilmez. Aktif gündem kartı, altındaki tüm argümanlarla birlikte doğrudan ıskartaya atılır.
5.  O anki aktif dağıtıcı yerdeki tüm çöpleri ve kartları toplar, yeniden karıp desteleri kapalı olarak masaya koyar. Herkese yeniden 5 kart dağıtır ve oyun kaldığı yerden, aynı skorlarla devam eder.
