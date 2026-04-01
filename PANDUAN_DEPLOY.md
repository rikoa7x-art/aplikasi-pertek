# Panduan Menjalankan Aplikasi di Komputer Lain

Ada 3 cara untuk menggunakan aplikasi ini di komputer lain, tergantung kebutuhan Anda:

## 1. Cara Paling Mudah (Portable / Tanpa Install)
Cocok jika Anda hanya ingin **menggunakan** aplikasi tanpa mengubah kode.

1. Jalankan perintah ini di terminal komputer Anda saat ini:
   ```bash
   npm run build
   ```
2. Tunggu sampai selesai. Akan muncul folder baru bernama **`dist`**.
3. Buka folder `dist`, cari file **`index.html`**.
4. **Copy file `index.html` (atau seluruh folder `dist`)** ke flashdisk atau kirim via email ke komputer lain.
5. Di komputer lain, cukup **double-klik** file `index.html` tersebut. Aplikasi akan terbuka di browser secara offline!

---

## 2. Cara Jaringan Lokal (Tanpa Copy File)
Cocok jika kedua komputer berada di **jaringan WiFi yang sama** dan Anda hanya ingin akses sementara.

1. Di komputer utama (tempat kode berada), jalankan:
   ```bash
   npm run dev
   ```
2. Perhatikan output di terminal, cari bagian **Network**:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.1.5:5173/  <-- Gunakan alamat ini
   ```
3. Buka browser di komputer/HP lain yang terhubung ke WiFi yang sama.
4. Ketik alamat Network tersebut (contoh: `http://192.168.1.5:5173`).

---

## 3. Cara Development (Untuk Edit Kode)
Cocok jika Anda ingin **melanjutkan coding** di komputer lain.

1. Pastikan komputer baru sudah terinstall **Node.js** (download di [nodejs.org](https://nodejs.org/)).
2. Copy seluruh folder proyek `perenacaan pipa` ke komputer baru.
3. Buka terminal di dalam folder proyek tersebut.
4. Jalankan perintah clean install:
   ```bash
   npm install
   ```
5. Jalankan aplikasi:
   ```bash
   npm run dev
   ```
