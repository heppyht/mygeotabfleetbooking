# Desain booking dan approval kendaraan untuk MyGeotab Add-In

## Rekomendasi penyimpanan

Untuk kebutuhan operasional armada (asumsi awal ~5 kendaraan dengan volume puluhan hingga maksimal ratusan booking per minggu), simpan data booking menggunakan **MyGeotab Add-In Storage API** (`AddInData`), bukan `localStorage` browser dan bukan entitas telematika seperti `Device`. Geotab mendokumentasikan Storage API sebagai penyimpanan data JSON umum milik add-in di database customer; record dipisahkan menggunakan `AddInId`. Ini memenuhi preferensi tanpa database eksternal.

Add-in melakukan seluruh operasi melalui MyGeotab API dan sesi pengguna yang sedang login. Jangan menyimpan username/password atau API key di HTML/JavaScript. Hak akses pengguna MyGeotab tetap berlaku.

## Alur kerja (Request → Approval & Dispatch)

Add-in menggunakan pola **Request → Approval & Dispatch** (*pool vehicle management*):

1. **Pengajuan Booking (semua pengguna berizin `AddInData`):**
   - Pemohon mengisi waktu **Start**, **End**, **Purpose** *(wajib)*, dan **Destination** *(wajib)*.
   - Pemohon **tidak memilih kendaraan** saat membuat booking.
   - Booking baru disimpan dengan status **`pending`** dan belum memiliki kendaraan (`deviceId: null`) maupun pengemudi (`driverId: null`).
   - Pengajuan dengan waktu yang saling beririsan **tidak dibatasi** pada tahap booking (baik oleh pengguna berbeda maupun pengguna yang sama); keputusan prioritas dan alokasi dilakukan oleh Approver.
   - Halaman **Booking** menampilkan daftar **"My Bookings"** (hanya booking milik pengguna yang sedang login berdasarkan `createdBy`) dengan filter rentang waktu default **`This week`** (serta opsi lain seperti `Upcoming`, `This month`, dan `All`).
2. **Peninjauan & Alokasi (khusus Security Clearance `Administrator`):**
   - Menu dan halaman **Approval** hanya ditampilkan dan dapat diakses oleh pengguna dengan Security Clearance **`Administrator`** (`GroupEverythingSecurityId` / `EverythingSecurity`). Bagi non-Administrator, menu **Approval** disembunyikan (*hidden*) dan seluruh aksi approval diblokir oleh *guard* di kode.
   - Administrator meninjau booking berstatus `pending` dan memilih salah satu keputusan:
     - **Approve:** wajib memilih **Vehicle** (kendaraan berstatus `Active`) dan **Driver** (pengguna dengan `isDriver === true` dan Account Status `Active`). Field **Notes** (`approvalNotes`) bersifat opsional. Status berubah menjadi **`approved`**.
     - **Reject:** tanpa memilih Vehicle maupun Driver. Field **Notes** (`approvalNotes`) **wajib diisi** sebagai alasan penolakan. Status berubah menjadi **`rejected`**.
3. **Pembatalan & Perubahan:**
   - Status **`pending`**: pemohon boleh **Edit** (mengubah waktu, purpose, dan destination) atau **Cancel**.
   - Status **`approved`** (dan status legacy **`confirmed`**): **tidak boleh Edit**, tetapi dapat di-**Cancel** baik oleh pemohon (di halaman **Booking**) maupun oleh **Administrator** (di halaman **Approval**, dengan **alasan pembatalan wajib**). Jika terjadi kesalahan approval atau perubahan jadwal, booking dibatalkan lalu pemohon membuat booking baru.
   - Status **`rejected`** dan **`cancelled`**: bersifat *read-only*.

### Diagram transisi status

```text
[Create booking] ──► pending
                       ├── (Requester Edit)     ──► pending
                       ├── (Requester Cancel)   ──► cancelled
                       ├── (Admin Reject+Notes) ──► rejected
                       └── (Admin Approve + Vehicle + Driver) ──► approved
                                                                     └── (Requester / Admin Cancel) ──► cancelled
```

## Model data (`AddInData.details`)

Simpan satu booking per `AddInData` record. Struktur `details` target:

```json
{
  "bookingKey": "uuid",
  "status": "pending",
  "startUtc": "2026-11-25T06:30:00.000Z",
  "endUtc": "2026-11-25T07:30:00.000Z",
  "startEpoch": 1795501800000,
  "endEpoch": 1795505400000,
  "purpose": "Customer visit",
  "destination": "Kawasan Industri Cikarang",
  "createdBy": "user@company.com",
  "createdAtUtc": "2026-11-25T04:30:00.000Z",
  "updatedAtUtc": "2026-11-25T04:30:00.000Z",
  "deviceId": null,
  "deviceName": null,
  "driverId": null,
  "driverName": null,
  "driverLogin": null,
  "approvalNotes": "",
  "reviewedBy": null,
  "reviewedAtUtc": null,
  "cancelledBy": null,
  "cancelledAtUtc": null,
  "cancellationReason": ""
}
```

Catatan desain skema:
- Isi `addInId` dengan ID add-in yang tetap dan gunakan `groups` sesuai cakupan pengguna yang boleh melihat data. Simpan `AddInData.id` hasil API untuk memperbarui record.
- Pembatalan mengubah `status` menjadi `cancelled` (mengisi `cancelledAtUtc`) alih-alih menghapus record, agar histori dan audit tetap terjaga.
- Field `startEpoch` dan `endEpoch` (Unix timestamp milidetik) disimpan sejak awal untuk mendukung optimasi server-side `whereClause` di masa depan tanpa perlu migrasi data lama.
- Field `createdBy`, `driverLogin`, `destination`, `purpose`, dan `approvalNotes` disiapkan agar kompatibel jika di masa depan ditambahkan mekanisme notifikasi email.
- Satu record per booking lebih mudah diperbarui dan diaudit dibanding satu record besar berisi seluruh booking (`AddInData.details` dibatasi 10.000 karakter per record).

### Kompatibilitas data lama (*backward compatibility*)

Record lama yang dibuat sebelum pembaruan workflow approval menggunakan `status: "confirmed"` tanpa field `destination`, `driver*`, `approvalNotes`, `reviewed*`, maupun `startEpoch`/`endEpoch`:
- Record `confirmed` tetap dikenali sebagai jadwal aktif dalam pengecekan bentrok kendaraan di halaman Approval.
- Di halaman Booking ("My Bookings"), pemohon hanya dapat melakukan **Cancel** (bukan Edit) pada record `confirmed`.
- Di halaman Reports, record `confirmed` tetap tampil dengan label jelas (mis. `Confirmed`) dan field yang belum ada (`destination`, `driver`, `approvalNotes`) ditampilkan sebagai `—`.

## Aturan validasi & bentrok

- Simpan waktu sebagai ISO-8601 UTC (`startUtc`, `endUtc`) beserta `startEpoch`/`endEpoch`; tampilkan dan inputkan waktu menurut zona waktu lokal browser pengguna.
- Validasi `startUtc < endUtc` saat membuat dan mengubah booking.
- Validasi `purpose` wajib diisi (non-kosong setelah trim) dan `destination` wajib diisi (non-kosong setelah trim).
- **Tidak ada blokir overlap pada tahap pembuatan/edit booking (`pending`)**: pengguna berbeda maupun pengguna sama diperbolehkan mengajukan waktu yang saling beririsan.
- **Pengecekan bentrok ganda pada tahap `Approve`:**
  1. **Vehicle conflict:** tolak approval jika kendaraan (`deviceId`) yang dipilih sudah terpakai oleh booking berstatus `approved` (atau legacy `confirmed`) lain yang memenuhi `newStart < existingEnd && newEnd > existingStart`.
  2. **Driver conflict:** tolak approval jika pengemudi (`driverId`) yang dipilih sudah di-assign ke booking berstatus `approved` lain yang memenuhi `newStart < existingEnd && newEnd > existingStart`.
  3. Booking yang berbatasan persis (`newStart === existingEnd` atau `newEnd === existingStart`) tetap diperbolehkan.
  4. Untuk UX dispatcher yang baik, dropdown Vehicle dan Driver pada form review menandai kendaraan/pengemudi yang sedang terpakai pada slot waktu tersebut agar Administrator tidak perlu menebak.
- Validasi keputusan **Reject**: `approvalNotes` wajib diisi (non-kosong setelah trim); `deviceId` dan `driverId` dibiarkan kosong/`null`.
- Saat add-in dibuka, muat ulang booking dari API; jangan menjadikan cache browser sebagai sumber kebenaran.
- Sebelum menyimpan perubahan (`Add`/`Set`) pada approval maupun cancel, ambil ulang data terbaru dari API untuk memeriksa status terkini dan potensi bentrok.

## Dampak pada halaman lain

- **Booking:** Form tidak lagi memuat dropdown Vehicle dan tidak lagi memblokir tombol submit hanya karena daftar `Device` kosong/tidak terbaca oleh user biasa. Banner status fokus pada kesiapan penyimpanan booking.
- **Approval:** Halaman aktif khusus `Administrator`, dengan badge jumlah `pending` pada menu navigasi, filter status (default `Pending`, plus `Approved`, `Rejected`, `Cancelled`, `All`), panel review Approve (dropdown hanya menampilkan **Vehicle** dan **Driver** yang *available* pada slot booking tersebut, dengan info unit/driver yang terpakai di teks bantu, serta tombol Approve otomatis non-aktif bila 0 tersedia), Reject (Notes wajib), serta Cancel pada booking `Approved` (alasan wajib).
- **Drivers & Users:** Halaman khusus `Administrator` (menu disembunyikan untuk non-Admin + guard di kode) dengan 2 sub-tab: **`Drivers`** (papan ketersediaan driver: 3 KPI nyata + status `Available` / `On trip` / jadwal berikutnya) dan **`All users`** (direktori akun tanpa `Functional role`, dilengkapi filter `Driver status` dan `Account status`).
- **Reports:** Filter status mencakup `Pending`, `Approved`, `Rejected`, `Cancelled`, dan `Confirmed` (legacy). Filter `Booked by` berupa dropdown berisi daftar unik pemohon dari data booking (`All requesters`). Kartu KPI menampilkan `Total Bookings`, `Pending Approval`, `Approved`, dan `Rejected / Cancelled`. Tabel histori menampilkan `Vehicle`, `Driver`, `Booked by`, `Destination`, `Purpose`, `Start`, `End`, `Status`, dan `Notes`.
- **Vehicles:** Ditingkatkan menjadi **Fleet Availability Board** (tetap terbuka untuk semua user) dengan 3 KPI nyata (`Active vehicles`, `Available now`, `In use now`), search & filter availability, serta tabel operasional `Current / Next schedule` berdasarkan jadwal booking `approved`/`confirmed` saat ini (bukan status GPS live).

## Strategi query, skalabilitas, dan evolusi masa depan

### Filter rentang waktu (`This week`) dan batasan `AddInData`
- `AddInDataSearch` mendukung `whereClause` dengan operator perbandingan dasar (`=`, `<`, `>`, `<=`, `>=`) yang bersifat *case-sensitive* dan perlu dipasangkan dengan `selectClause`, tetapi **tidak mendukung operator logika `AND`/`OR`**.
- Pada implementasi tahap ini, filter `This week` pada daftar booking milik pengguna dijalankan di **client-side** agar sederhana, stabil, dan kompatibel dengan record lama yang belum memiliki `endEpoch`.
- Dengan asumsi 5 kendaraan dan 50–100 booking/minggu (~2.500–5.000 record/tahun; ±0,5 KB per record), pemuatan penuh masih ringan untuk fase awal (~1.000–1.500 record).
- **Jalur optimasi jika data mulai menembus ribuan record (tanpa backend eksternal):**
  1. **Single-bound server-side `whereClause`:** memanfaatkan field `endEpoch` yang sudah disimpan sejak awal (mis. `endEpoch >= <awalMingguIni>`) atau `status = "pending"` untuk memotong record lama di sisi server MyGeotab (perilaku `whereClause` + `selectClause` harus diverifikasi lebih dulu di tenant target).
  2. **Partisi / arsip berbasis `addInId`:** memindahkan booking selesai yang lebih tua dari 6–12 bulan ke `addInId` arsip terpisah sehingga halaman Booking dan Approval hanya membaca `addInId` aktif, sementara halaman Reports menyediakan opsi untuk memuat arsip bila diperlukan.

### Kesiapan notifikasi email di masa depan
- MyGeotab API tidak menyediakan endpoint `SendEmail` umum untuk Add-In (notifikasi email bawaan `DistributionList`/`Recipient` hanya terpicu oleh *Exception Rules* telematika), dan browser tidak boleh menyimpan kredensial SMTP/API key email.
- Jika notifikasi email otomatis saat perubahan status diperlukan di fase berikutnya, jalur paling ringan adalah menambahkan endpoint *serverless webhook* (mis. Cloudflare Worker, Cloud Function, Power Automate, atau n8n) yang memverifikasi sesi MyGeotab lalu mengirim email ke `createdBy` dan `driverLogin`.

## Batasan keamanan & konsistensi

### Otorisasi client-side (*UI/application-level enforcement*)
- Karena add-in berjalan sepenuhnya di browser tanpa backend dan pemohon biasa tetap membutuhkan izin tulis `AddInData` agar dapat membuat booking, pembatasan halaman dan aksi Approval untuk `Administrator` merupakan **UI/application-level enforcement**, bukan penegakan keras di level server `AddInData`.
- Pengecekan clearance menggunakan prinsip ***fail-closed***: jika akun non-Admin tidak memiliki izin `Get User` atau `Get Group`, add-in memperlakukan pengguna sebagai non-Administrator (`isAdmin = false`) tanpa memunculkan error yang mengganggu halaman Booking.
- Setiap keputusan approval/reject menyimpan jejak audit (`reviewedBy`, `reviewedAtUtc`, `approvalNotes`). Jika di masa depan kebijakan keamanan mewajibkan *hard server-side RBAC*, gunakan backend proxy untuk operasi tulis booking dan approval.

### Batasan konsistensi (non-atomic check)
- Pengecekan bentrok berbasis `Get` lalu `Set` bukan transaksi atomik: dua Administrator yang meng-approve kendaraan atau driver yang sama pada slot bertabrakan di saat hampir bersamaan masih dapat lolos pengecekan sebelum keduanya menulis record.
- Add-in meminimalkan risiko ini dengan melakukan re-fetch tepat sebelum `Set` dan pemeriksaan ulang pasca-simpan (*post-save verification*) untuk menampilkan peringatan bila terdeteksi konflik serentak. Jika bisnis mensyaratkan jaminan atomik mutlak, gunakan backend dengan transaksi/constraint database.

## Implementasi & pengujian pada repository

- Struktur kode dimodularisasi dengan batas maksimal **500 baris per file** (terjaga otomatis oleh unit test) dan tetap *zero-build* untuk static HTTPS hosting MyGeotab:
  - `fleet-summary.html` — markup HTML saja tanpa inline JavaScript.
  - `css/base.css`, `css/components.css`, `css/pages.css` — styling modular dan responsif.
  - `js/domain/booking-domain.js`, `js/domain/user-domain.js` — logika domain murni (validasi, lifecycle status, bentrok vehicle/driver, filter `This week`/Reports, resolusi clearance `Administrator`, filter active driver).
  - `js/services/geotab-api.js` — layer komunikasi MyGeotab API (`AddInData`, `Device`, `User`, `Group`).
  - `js/ui/` — modul tampilan per halaman (`formatters.js`, `booking-view.js`, `approval-review-form.js`, `approval-view.js`, `users-view.js`, `reports-view.js`, `vehicles-view.js`) dan `js/app.js` sebagai orkestrator.
- Konfigurasi add-in berada di `configuration.json`; panduan setup ada di `README.md`.
- Tes unit dijalankan dengan Node.js (`node --test tests/booking-domain.test.js tests/user-domain.test.js tests/code-constraints.test.js`) dan mencakup validasi field wajib (`purpose`, `destination`, `approvalNotes` saat reject), filter `This week` per user, deteksi clearance `Administrator` (*fail-closed*), filter active driver, bentrok vehicle & driver, transisi status, kompatibilitas record `confirmed` lama, serta batas ≤ 500 baris per file.
- Pengujian langsung di tenant MyGeotab tetap diperlukan untuk memverifikasi izin `AddInData`, `Device`, `User`, dan `Group` untuk akun Administrator maupun non-Administrator, zona waktu browser, dan skenario multi-pengguna serentak.

## Referensi resmi

- [Storage API untuk Add-In](https://developers.geotab.com/myGeotab/addIns/addInStorage/) — AddInData, isolasi menggunakan `AddInId`, `whereClause`/`selectClause`, batas 10.000 karakter, operasi, security clearance, dan batasan pencarian.
- [AddInData API object](https://developers.geotab.com/myGeotab/apiReference/objects/AddInData/) — properti `addInId`, `details`, `groups`, dan `id`.
- [MyGeotab API `Add` method](https://developers.geotab.com/myGeotab/apiReference/methods/Add/) — operasi Add membuat entity baru di database.
- [MyGeotab API `Set` method](https://developers.geotab.com/myGeotab/apiReference/methods/Set/) — operasi Set memperbarui entity di database.
- [Developing Add-Ins](https://developers.geotab.com/myGeotab/addIns/developingAddIns/) — Add-In sebagai ekstensi MyGeotab, akses API, konfigurasi, dan kebutuhan hosting.
- [Geotab SDK map add-in samples](https://github.com/Geotab/sdk-map-addin-samples) — contoh resmi penggunaan API dan service Add-In.
