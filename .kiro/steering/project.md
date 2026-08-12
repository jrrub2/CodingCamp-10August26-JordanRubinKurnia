# Tempo · Personal Dashboard — Project Overview

## Deskripsi
Tempo adalah personal productivity dashboard berbasis browser, berjalan sepenuhnya di sisi klien (local-first). Tidak ada backend, tidak ada server — semua data tersimpan di `localStorage` browser pengguna.

## Fitur Utama
- **Focus Timer** — Pomodoro timer dengan animasi SVG ring, preset (Pomodoro / Short Break / Long Break), dan custom duration. Dilengkapi Web Audio API chime saat sesi selesai.
- **Tasks** — Manajemen tugas dengan filter (All / Open / Done), sorting, progress bar, dan inline edit.
- **Quick Links** — Bookmark cepat dengan avatar warna-warni dan validasi URL otomatis.
- **Live Clock** — Jam real-time dengan tanggal, nomor minggu ISO, hari ke-sekian dalam tahun, dan timezone.
- **Telemetry HUD** — Ringkasan statistik sesi (tasks done, pending, focus sessions, focus minutes) dengan animasi angka.
- **Theme** — Light/dark mode dengan deteksi `prefers-color-scheme`, toggle manual, dan persisted ke state.
- **Export / Import** — Data portability via JSON backup file.

## Struktur File
```
/
├── index.html        # Seluruh markup, satu halaman
├── css/
│   └── style.css     # Design tokens, komponen, responsive
└── js/
    └── script.js     # Semua logika aplikasi (IIFE, vanilla JS)
```

## Stack
- **Vanilla HTML / CSS / JavaScript** — tanpa framework, tanpa build tool, tanpa dependensi eksternal.
- **localStorage** sebagai persistence layer, dengan fallback in-memory jika tidak tersedia.
- **Web Audio API** untuk chime timer.
- **CSS Custom Properties** untuk design tokens dan theming.

## Konvensi State
State aplikasi disimpan dalam satu objek `state` dengan key `tempo.dashboard.v1` di localStorage.  
Shape: `{ name, theme, tasks[], links[], focus: { sessions, minutes }, ui: { filter, sort }, timerMinutes }`

## Pemilik / Identitas
- GitHub: [jrrub2](https://github.com/jrrub2)
- Kelas: RevoU CodingCamp — 10 Agustus 2026
- Nama peserta: Jordan Rubin Kurnia
