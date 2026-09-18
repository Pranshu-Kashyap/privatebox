# PrivateBox — local version

PrivateBox inspects common metadata in photos, PDFs and DOCX files entirely in your browser and can create cleaned copies.

## Run locally

1. Install Node.js 20+ from https://nodejs.org/
2. Open a terminal in this folder.
3. Run:

```bash
npm install
npm run dev
```

4. Open the local URL Vite prints (normally http://localhost:5173).

## What it supports

- JPG / JPEG / PNG / WebP metadata inspection
- Embedded GPS latitude + longitude extraction when present
- EXIF dates, camera/device, software/author-style metadata
- Multiple files in one scan
- Clean image copies via browser re-encoding (removes embedded EXIF/XMP metadata)
- PDF metadata inspection + cleaning
- DOCX core/app/custom property inspection + cleaning
- ZIP download for multiple cleaned files
- No backend and no upload endpoint

## Important notes

- Many messaging/social apps strip GPS/EXIF before you receive an image, so PrivateBox can only show coordinates that actually remain embedded in the selected file.
- Re-encoding JPEG/WebP images removes metadata but can slightly change file size or compression. PNG output is lossless at the pixel level.
- PDF cleaning removes the common document-info metadata exposed by pdf-lib; it is not a forensic PDF sanitizer.
- DOCX cleaning removes common Office property files and comment/person metadata. It does not promise forensic anonymity of every possible embedded object.
