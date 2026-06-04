# Siyaset Meydanı - Sohbet Geçmişi ve Geliştirme Süreci (Agent-to-Agent Handover)

Bu dosya, projenin beyin fırtınası sürecini, yapılan oyun testlerini ve alınan kritik tasarım kararlarını özetlemektedir. Diğer bilgisayardan projeyi açan geliştirici/yapay zeka ajanı, bu dökümanı okuyarak kaldığımız yeri ve bağlamı anında yakalayabilir.

---

## 📅 Tasarım Oturumu Tarihi: 30 Mayıs 2026

### 💬 1. Fikir Aşaması ve İlham Kaynakları
Oyunun temellerini oluştururken 3 farklı oyunun mekaniklerini harmanladık:
1.  **Exploding Kittens:** Sıra bittiğinde kart çekme anındaki risk/tansiyon ve eldeki sabotaj/reaksiyon kartları (örn: "Nope").
2.  **SHASN:** Karakterlerin ideolojik/grupsal duruşlarının ve gündem konularının uyumu.
3.  **Marvel Snap:** Hızlı, kulvarlı kart yerleştirme ve baraj geçme mantığı.

Ancak oyun testleri ve tartışmalar sonucunda bu karmaşık yapıyı **bütünsel bir sadeliğe** indirgedik.

---

## 🎲 2. YÜRÜTÜLEN MİNİ PLAYTEST (OYUN TESTİ)

Oyun mekaniğinin arkasındaki matematiği test etmek için sohbet üzerinden interaktif bir el oynadık.

*   **Ortadaki Gündem:** 🔵 **Mavi Gündem** (Çözüm Eşiği: 10 AG / Ödül: +10 Kamuoyu Puanı)
*   **Oyuncu Hamlesi (Tur 1):** Oyuncu 3 Enerjisinden 1'ini harcayarak `[🔵 Mavi-1]` kartını oynadı (Renk uyumuyla 4 Güç verdi). Kalan 2 enerjisini bir sonraki tura saklayarak turu pas geçti ve desteden `[⚫ Siyah] Nope` kartı çekti. (Masadaki güç: **4 / 10**).
*   **Bot Hamlesi (Tur 1):** Bot masada 4 güç olduğunu gördü. Sıradaki oyuncunun (sizin) kolayca kazanmasını engellemek için `[⚫ Siyah] 2 Enerji / Sabotaj` kartıyla masadaki 4 gücü sıfırladı. Kalan 1 enerjisiyle `[🔴 Kırmızı] 1 Enerji / 2 Güç` oynadı. (Masadaki güç: **2 / 10**).
*   **Oyuncu Hamlesi (Tur 2 - Karşı Atak):** Oyuncu `[🔵 Mavi-2]` kartını oynadı (Renk uyumuyla 6 Güç verdi. Toplam güç: **8 / 10**). Kalan 1 enerjisiyle elindeki `[⚫ Siyah] Nope` kartını masaya **reaktif tuzak** olarak kurdu.
*   **Bot Hamlesi (Tur 2 - Tuzak Tetiklendi):** Bot masada 8 güç olduğunu görüp kazanmak için `[🔵 Mavi]` 1 Enerjilik (4 güç veren) kartını oynadı. Ancak oyuncunun **Nope** tuzağı anında tetiklenerek botun hamlesini bloke etti! Botun kalan diğer kartı 3 enerjilik olduğu için enerjisi yetmedi ve turu çaresizce pas geçti. (Masadaki güç hala **8 / 10**).
*   **Oyuncu Hamlesi (Tur 3 - Zafer):** Oyuncu desteden yeni çektiği `[🔵 Mavi] 1 Enerji / 3 Güç` kartını oynadı. Renk uyumuyla 4 güç eklendi, toplam güç **12 / 10** oldu ve baraj aşıldı! Oyuncu gündemi çözerek **+10 Puan** kazandı ve skoru **60 - 40** yaptı.

---

## ⚖️ 3. ALINAN KRİTİK TASARIM VE BALANS KARARLARI

Sohbet esnasında tespit edilen ve karara bağlanan iki büyük tasarım açmazı ve çözümleri:

### A. Gizli Bilgi ve Reaksiyon Kartlarının Masaüstü Uyumu (Çözüm A)
*   **Açmaz:** Dijital oyunda tuzak kurmak kolaydır ama fiziksel kart oyununda rakip masaya kapalı kart koyduğumuzu görür.
*   **Karar:** `Nope` ve `Sabotaj` kartları masaya önceden kapalı konulmaz. Elde gizli tutulur. Rakip kendi sırasındayken kart oynadığı an, elden aniden masaya fırlatılarak **reaktif** olarak oynanır. Hem dijitalde hem masaüstünde kusursuz çalışır.

### B. "Tahterevalli Döngüsü" ve Oyun Süresi (Kilit A)
*   **Açmaz:** Eğer bir tur siz 10 puan kazanır, bir tur rakip sizden 10 puan çalarsa oyun sonsuz bir döngüye girip hiç bitmeyebilirdi.
*   **Karar:** Puanlar birbirinin barından eksilmez. Herkes oyuna **0 Puan** ile başlar ve puanlar kendi hanesinde birikir. **50+1 Puan barajına** (Salt Çoğunluk) ilk ulaşan oyunu kazanır.

### C. Özel Kriz Kartı Dengeleri (Mizahi & Taktiksel):
*   **Çamur At İzi Kalsın (Baraj: 8 AG):** Çözen kişi puan almaz, rakibinden **-10 Puan** siler (Lideri aşağı çekme freni).
*   **Çiçek Sulama İfşası (Baraj: 12 AG - Tur Sınırı):** Açıldığı turun sonuna kadar çözülmek zorundadır. Çözen **+5 Puan** alır, rakipleri **-5 Puan** kaybeder. Çözülemezse **bütün oyuncular -7 Puan kaybeder.**

---

## 🔮 4. BİR SONRAKİ AŞAMA HEDEFLERİ (GELECEK PLANLAR)

Proje diğer bilgisayarda açıldığında veya yeni oturuma başlandığında üzerinde çalışılacak konular:
1.  **Argüman Kartlarının Dağılımı:** Destedeki sayılar ve kart bütçeleri (kaç adet 1, 2, 3 enerjilik kart olacağı).
2.  **Arketip Karakter Yetenekleri:** 🔴 Siyasi, 🔵 Toplumsal ve 🟡 Kültürel karakterlerin kendilerine has pasif avantajlarının kodlanması/tasarlanması.
3.  **Grafik & Arayüz Ön Hazırlığı:** Yazısız, renk-ikon odaklı kart tasarımlarının eskizleri.

---

## 📅 Tasarım Oturumu Tarihi: 4 Haziran 2026

### 💬 1. Asimetrik Karakter Yetenekleri ve Denge Revizyonu
Önceki sadeleştirilmiş sistemi koruyarak, oyuna asimetrik derinlik katacak 6 benzersiz karakter (Bürokrat, Kolluk Kuvveti, Anchorman, Gazeteci, Aktivist Sanatçı, Popüler Influencer) tasarladık. Her birine oyun tarzını kökten etkileyecek avantajlar ve zayıflıklar tanımladık.

### 📦 2. 64 Kartlık Matematiksel Deste Dengesi
Destelerin içeriklerini netleştirip toplam kart sayısını 64'e sabitledik:
*   **Gündem Destesi (14 Kart):** 12 Normal Gündem + 2 Kriz Kartı.
*   **Merkez Oyuncu Destesi (44 Kart):** 1'likten 4'lüğe Argümanlar ile Nope, Sabotaj, Gündem Değiştir ve yeni eklenen **Fonlama** kartları.
*   **Karakterler (6 Kart).**

### 🔄 3. Oynanış ve "Tasfiye (Liquidation)" Protokolü
Deste bittiğinde oyunun kilitlenmesini engellemek için "Tasfiye Safhası" ekledik:
*   Deste bittiğinde oyuncular kart çekmeden ellerindeki kartları sırayla 1'er Enerji harcayarak kapalı çöpe fırlatır.
*   Tüm eller boşaldığında aktif gündem geçersiz sayılır, puan verilmez.
*   Dağıtıcı tüm kartları toplar, karıştırır, yeniden 5'er kart dağıtır ve oyun aynı skorlarla devam eder.

