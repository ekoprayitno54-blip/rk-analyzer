# RK Analyzer — SPBU & LPG

Aplikasi web untuk mengunggah rekening koran bank dan memberi keterangan transaksi dengan pembanding tabel setoran serta tabel tebusan SPBU/LPG.

## Fitur V1
- Login Supabase Auth.
- Multi-unit: SPBU, LPG, SPPBE, OTHER.
- Upload Excel/CSV rekening koran.
- Upload tabel setoran sebagai pembanding kredit.
- Upload tabel tebusan sebagai pembanding debit.
- Rekonsiliasi otomatis berdasarkan nominal + kedekatan tanggal.
- Heuristik untuk Pertamina, QRIS, setoran, pinjaman, listrik, dll.
- Keterangan bank asli dipertahankan; keterangan internal dapat diedit.
- Audit log untuk perubahan keterangan internal.
- Anti-duplikat rekening koran melalui fingerprint transaksi.
- Export CSV dan cetak dari browser.
- Data tersimpan online di tabel `rk_*` Supabase dan dilindungi RLS per pengguna.

## Environment
Salin `.env.example` menjadi `.env.local` dan isi:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

## Menjalankan
```
npm install
npm run dev
```

## Build produksi
```
npm run build
npm start
```

## Database
Schema produksi menggunakan prefix `rk_` agar terpisah dari modul SPBU Control yang memakai prefix `spbu_`.
