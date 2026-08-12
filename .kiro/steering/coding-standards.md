# Coding Standards — Tempo Dashboard

## Prinsip Umum
- **Vanilla only** — tidak boleh menambahkan framework (React, Vue, dll), build tool (Webpack, Vite, dll), atau library eksternal apapun.
- **Satu file per layer** — semua markup di `index.html`, semua style di `css/style.css`, semua logika di `js/script.js`.
- **Tidak memodifikasi file yang sudah ada** kecuali secara eksplisit diminta pengguna.

## JavaScript
- Seluruh kode JS dibungkus dalam satu IIFE: `(() => { 'use strict'; ... })();`
- Gunakan `const` secara default; `let` hanya jika variabel perlu di-reassign; hindari `var`.
- Selector DOM menggunakan helper `$` (querySelector) dan `$$` (querySelectorAll) yang sudah terdefinisi di script.
- Event listener menggunakan **event delegation** pada container — hindari listener per-item yang bisa bocor memori.
- Semua string yang dimasukkan ke `innerHTML` harus di-escape menggunakan fungsi `esc()` yang sudah ada.
- Gunakan `uid()` untuk membuat ID unik pada tasks dan links.
- Semua operasi state harus melalui mutasi objek `state`, diikuti pemanggilan `save()`, lalu render ulang.

## CSS
- Semua nilai warna dan spacing menggunakan **CSS custom properties** dari `:root` (token di bagian `1. TOKENS`).
- Dark mode diimplementasikan via `[data-theme="dark"]` selector — tidak menggunakan `@media (prefers-color-scheme)` langsung di komponen.
- Animasi dan transisi harus memperhatikan `@media (prefers-reduced-motion: reduce)`.
- Gunakan `clamp()` untuk font-size yang responsif.
- Hindari magic number — referensikan token yang ada jika memungkinkan.

## HTML
- Setiap seksi interaktif harus memiliki atribut `aria-label` atau `aria-labelledby` yang sesuai.
- Tombol yang berfungsi sebagai toggle harus menggunakan `aria-pressed`.
- Input form harus memiliki `aria-label` atau `<label>` eksplisit.
- Gunakan elemen semantik yang tepat: `<header>`, `<main>`, `<footer>`, `<section>`, `<nav>`, `<form>`.

## Aksesibilitas (a11y)
- Semua kontrol interaktif harus dapat diakses via keyboard.
- Focus ring harus terlihat (sudah diatur via `:focus-visible` di style.css).
- Jangan hapus outline tanpa menyediakan alternatif visual.
- Konten yang hanya dekorasi harus memiliki `aria-hidden="true"`.

## Performa
- Hindari layout thrashing — batch DOM reads sebelum DOM writes.
- Gunakan `DocumentFragment` saat merender list panjang (sudah diterapkan di `renderTasks` dan `renderLinks`).
- Timer menggunakan `setInterval` + koreksi `Date.now()` — bukan akumulasi naif.
- Revoke object URL setelah digunakan (`URL.revokeObjectURL`).

## Keamanan
- Semua input pengguna yang dirender ke DOM harus melalui `esc()` — tidak boleh ada raw `innerHTML` dari data pengguna.
- URL yang dimasukkan pengguna harus divalidasi via `normalizeUrl()` — hanya protokol `http:` dan `https:` yang diizinkan.
- Atribut `rel="noopener noreferrer"` wajib pada semua link `target="_blank"`.

## Penamaan
- Fungsi: camelCase, kata kerja deskriptif — `renderTasks`, `addTask`, `commitEdit`.
- Konstanta global: UPPER_SNAKE_CASE — `PRESETS`, `DEFAULTS`, `KEY`.
- ID elemen HTML: kebab-case — `timer-toggle`, `task-input`.
- CSS class: kebab-case — `.task-list`, `.ring-prog`, `.state-pill`.
