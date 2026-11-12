# Third-party code bundled with the app

| Folder | What | Version | Licence |
|---|---|---|---|
| `maplibre-gl.*` | MapLibre GL JS, the map engine | (see file header) | BSD-3-Clause |
| `pdfjs/` | pdf.js by Mozilla: reads text in PDFs and draws their pages (Documents) | pdfjs-dist 6.5.438 | Apache-2.0 |
| `tesseract/` | Tesseract.js: reads printed text in photos and screenshots, on the phone (Documents) | tesseract.js 7.0.0, tesseract.js-core 6.1.2 (SIMD + LSTM build) | Apache-2.0 |
| `tesseract/eng.traineddata.gz` | English text model for Tesseract (4.0.0_best_int) | @tesseract.js-data/eng 1.0.0 | MIT (model data Apache-2.0, from tesseract-ocr/tessdata) |

These load only when they're needed (adding or viewing a document), and are then kept for offline use.
To update one: `npm install <package>@<version>` in a scratch folder and copy the same files across.
