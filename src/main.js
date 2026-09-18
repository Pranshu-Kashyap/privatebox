import './style.css';
import * as exifr from 'exifr';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE = 'application/pdf';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const state = {
  files: [],
  reports: [],
  cleaned: new Map(),
  ocrWorker: null,
  ocrUnavailable: false,
  previewUrls: []
};

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar shell">
    <a class="brand" href="#">PrivateBox <span>by Pranshu Kashyap</span></a>
    <a class="how" href="#how">How it works</a>
  </header>

  <main>
    <section class="hero shell">
      <p class="eyebrow">A LITTLE LESS EXPOSED.</p>
      <h1>What this file<br/>knows about you.</h1>
      <p class="lede">PrivateBox looks beyond EXIF. It checks hidden metadata, filenames and visible privacy clues before you share a file.</p>
    </section>

    <section class="workspace shell">
      <div class="panel upload-panel">
        <div class="section-number">01 <span>PRIVACY SCAN</span></div>
        <div class="privacy-pill">On-device analysis <b>+</b></div>

        <div id="dropzone" class="dropzone" tabindex="0" role="button">
          <div class="plus">+</div>
          <h2>Drop files. Find out.</h2>
          <p>Drag them here, or choose files from your device.</p>

          <button id="chooseBtn" class="primary">Choose files</button>

          <input
            id="fileInput"
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf,.docx"
          />

          <small>JPG, PNG, WebP, PDF or DOCX · Up to 25 MB each</small>
        </div>

        <p class="trust">
          Your files stay on your device. OCR, when available, runs in your browser.
          No image or document is uploaded to PrivateBox.
        </p>
      </div>

      <div class="panel results-panel">
        <div class="section-number">02 <span>PRIVACY REPORT</span></div>

        <div id="statusBadge" class="status-badge">AWAITING FILE</div>

        <h2>What could someone<br/>learn from this?</h2>

        <p class="muted">
          We combine metadata, filename clues and visible-content checks into one risk report.
        </p>

        <div id="results" class="results empty-results">

          <div class="result-row">
            <span>⌖</span>
            <div>
              <b>Location exposure</b>
              <p>GPS and location-like clues</p>
            </div>
            <strong>—</strong>
          </div>

          <div class="result-row">
            <span>◷</span>
            <div>
              <b>Time exposure</b>
              <p>Capture, creation or filename dates</p>
            </div>
            <strong>—</strong>
          </div>

          <div class="result-row">
            <span>▣</span>
            <div>
              <b>Identity clues</b>
              <p>Names, devices, authors and accounts</p>
            </div>
            <strong>—</strong>
          </div>

          <div class="result-row">
            <span>≡</span>
            <div>
              <b>Visible content</b>
              <p>Emails, phones, URLs, codes and QR data</p>
            </div>
            <strong>—</strong>
          </div>

        </div>

        <div id="actions" class="actions hidden">
          <button id="cleanAllBtn" class="primary">
            Make safe-to-share copies
          </button>

          <button id="downloadAllBtn" class="secondary hidden">
            Download all (.zip)
          </button>
        </div>
      </div>
    </section>

    <section class="metrics shell">

      <div>
        <span>PROCESSED IN YOUR BROWSER</span>
        <strong>LOCAL</strong>
      </div>

      <div>
        <span>FILE DATA UPLOADED</span>
        <strong>0 bytes</strong>
      </div>

      <div>
        <span>PRIVATE BY DESIGN</span>
        <strong>NO FILE SERVER</strong>
      </div>

    </section>

    <section id="how" class="how-section shell">

      <p class="eyebrow">BEFORE YOU HIT SHARE</p>

      <h2>
        Find the clues.<br/>
        Remove what can be removed.
      </h2>

      <div class="steps">

        <article>
          <span>01 / INSPECT</span>
          <h3>Read more than metadata.</h3>
          <p>
            PrivateBox checks metadata, filenames and visible text patterns.
            A file can expose useful clues even when EXIF is empty.
          </p>
        </article>

        <article>
          <span>02 / CLEAN + VERIFY</span>
          <h3>Create a safer copy.</h3>
          <p>
            We remove common metadata, create a fresh filename and scan the cleaned
            copy again so you can compare before and after.
          </p>
        </article>

      </div>
    </section>
  </main>

  <footer class="shell">
    <strong>PrivateBox</strong>
    <span>Less data out. More peace of mind.</span>
  </footer>
`;

const input = document.querySelector('#fileInput');
const chooseBtn = document.querySelector('#chooseBtn');
const dropzone = document.querySelector('#dropzone');
const results = document.querySelector('#results');
const badge = document.querySelector('#statusBadge');
const actions = document.querySelector('#actions');
const cleanAllBtn = document.querySelector('#cleanAllBtn');
const downloadAllBtn = document.querySelector('#downloadAllBtn');


// ----------------------------------------------------
// UPLOADED FILE PREVIEW AREA
// ----------------------------------------------------

const uploadPanel = document.querySelector('.upload-panel');

const previewSection = document.createElement('div');
previewSection.id = 'uploadedPreview';
previewSection.className = 'uploaded-preview hidden';

dropzone.insertAdjacentElement('afterend', previewSection);


// ----------------------------------------------------
// RESPONSIVE / MOBILE CSS
// Kept here in JS so no style.css changes are needed.
// ----------------------------------------------------

const responsiveStyles = document.createElement('style');

responsiveStyles.textContent = `

  /* ===========================
     FILE PREVIEW
  ============================ */

  .uploaded-preview {
    margin-top: 22px;
  }

  .uploaded-preview.hidden {
    display: none;
  }

  .uploaded-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .uploaded-preview-header span {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .uploaded-preview-header button {
    border: 1px solid #b9b4aa;
    background: transparent;
    padding: 8px 12px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .uploaded-file-list {
    display: grid;
    gap: 12px;
  }

  .uploaded-file-card {
    border: 1px solid #cbc6bb;
    overflow: hidden;
    background: #f7f4ed;
  }

  .uploaded-file-visual {
    width: 100%;
    min-height: 180px;
    max-height: 420px;
    background: #dedbd3;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  .uploaded-file-visual img {
    width: 100%;
    height: 100%;
    max-height: 420px;
    object-fit: contain;
    display: block;
  }

  .uploaded-file-visual object {
    width: 100%;
    height: 360px;
    border: 0;
    background: white;
  }

  .uploaded-file-placeholder {
    min-height: 220px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .uploaded-file-placeholder strong {
    font-family: Georgia, serif;
    font-size: 54px;
    font-weight: 400;
  }

  .uploaded-file-placeholder span {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .12em;
  }

  .uploaded-file-info {
    border-top: 1px solid #cbc6bb;
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
  }

  .uploaded-file-name {
    font-weight: 800;
    font-size: 14px;
    word-break: break-word;
  }

  .uploaded-file-meta {
    display: block;
    margin-top: 5px;
    font-size: 12px;
    opacity: .65;
  }

  .uploaded-file-number {
    font-size: 12px;
    white-space: nowrap;
  }


  /* ===========================
     TABLET
  ============================ */

  @media (max-width: 1050px) {

    .workspace {
      grid-template-columns: 1fr 1fr;
    }

    .results-panel h2 {
      font-size: clamp(38px, 5vw, 54px);
    }

  }


  /* ===========================
     MOBILE
  ============================ */

  @media (max-width: 820px) {

    body {
      overflow-x: hidden;
    }

    .shell {
      width: calc(100% - 32px);
      max-width: none;
    }

    .topbar {
      padding-top: 18px;
      padding-bottom: 18px;
    }

    .hero {
      padding-top: 52px;
      padding-bottom: 38px;
    }

    .hero h1 {
      font-size: clamp(46px, 14vw, 72px);
      line-height: .96;
    }

    .hero .lede {
      font-size: 17px;
      line-height: 1.5;
    }


    /* Main change:
       stack upload and report vertically */
    .workspace {
      display: block;
      border-left: 1px solid #111;
      border-right: 1px solid #111;
    }

    .upload-panel,
    .results-panel {
      width: 100%;
      box-sizing: border-box;
      padding: 26px 20px;
    }

    .upload-panel {
      border-right: 0 !important;
      border-bottom: 1px solid #111;
    }

    .results-panel {
      min-height: auto;
    }


    /* Upload box */
    .dropzone {
      min-height: 320px;
      padding: 38px 20px;
    }

    .dropzone h2 {
      font-size: clamp(34px, 10vw, 46px);
      line-height: 1;
    }

    .dropzone p {
      font-size: 16px;
    }

    .dropzone .primary {
      width: 100%;
      max-width: 300px;
    }

    .trust {
      font-size: 13px;
      line-height: 1.5;
    }


    /* Preview */
    .uploaded-file-visual {
      min-height: 180px;
      max-height: 360px;
    }

    .uploaded-file-visual img {
      max-height: 360px;
    }

    .uploaded-file-visual object {
      height: 300px;
    }


    /* Report */
    .results-panel h2 {
      font-size: clamp(39px, 11vw, 54px);
      line-height: 1;
      margin-top: 24px;
    }

    .results-panel > .muted {
      font-size: 16px;
      line-height: 1.5;
    }

    .file-card {
      padding-left: 0;
      padding-right: 0;
    }

    .file-head {
      gap: 10px;
    }

    .detail {
      grid-template-columns: 28px 1fr;
      gap: 10px;
      position: relative;
      padding-top: 18px;
      padding-bottom: 18px;
    }

    .detail em {
      grid-column: 2;
      justify-self: start;
      margin-top: 7px;
    }

    .detail p {
      overflow-wrap: anywhere;
    }

    .privacy-findings {
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .actions {
      display: grid;
      gap: 10px;
    }

    .actions button {
      width: 100%;
    }


    /* Metrics */
    .metrics {
      grid-template-columns: 1fr;
    }

    .metrics > div {
      border-right: 0 !important;
      border-bottom: 1px solid #111;
      padding: 18px 0;
    }


    /* How it works */
    .how-section {
      padding-top: 70px;
      padding-bottom: 70px;
    }

    .how-section h2 {
      font-size: clamp(40px, 11vw, 60px);
      line-height: 1;
    }

    .steps {
      grid-template-columns: 1fr;
      gap: 42px;
    }

    footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

  }


  /* ===========================
     SMALL PHONES
  ============================ */

  @media (max-width: 480px) {

    .shell {
      width: calc(100% - 20px);
    }

    .upload-panel,
    .results-panel {
      padding-left: 14px;
      padding-right: 14px;
    }

    .section-number {
      font-size: 11px;
    }

    .privacy-pill {
      font-size: 13px;
    }

    .dropzone {
      min-height: 280px;
      padding: 30px 14px;
    }

    .uploaded-file-info {
      padding: 12px;
    }

    .uploaded-file-number {
      display: none;
    }

    .status-badge {
      position: static;
      display: inline-block;
      margin-top: 14px;
    }

  }

`;

document.head.appendChild(responsiveStyles);

chooseBtn.addEventListener('click', e => {
  e.stopPropagation();
  input.click();
});

dropzone.addEventListener('click', () => input.click());

dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') input.click();
});

input.addEventListener('change', () => {
  handleFiles([...input.files]);
});

['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, e => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, e => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  });
});

dropzone.addEventListener('drop', e => {
  handleFiles([...e.dataTransfer.files]);
});

cleanAllBtn.addEventListener('click', cleanAll);
downloadAllBtn.addEventListener('click', downloadAll);

function classify(file) {
  if (
    IMAGE_TYPES.has(file.type) ||
    /\.(jpe?g|png|webp)$/i.test(file.name)
  ) {
    return 'image';
  }

  if (
    file.type === PDF_TYPE ||
    /\.pdf$/i.test(file.name)
  ) {
    return 'pdf';
  }

  if (
    file.type === DOCX_TYPE ||
    /\.docx$/i.test(file.name)
  ) {
    return 'docx';
  }

  return null;
}

async function handleFiles(files) {
  const valid = files.filter(file => {
    return classify(file) && file.size <= MAX_FILE_SIZE;
  });

  if (!valid.length) {
    alert(
      'Please choose JPG, PNG, WebP, PDF or DOCX files up to 25 MB each.'
    );
    return;
  }

  state.files = valid;
  state.reports = [];
  state.cleaned.clear();
  renderUploadedFilePreviews(valid);

  badge.textContent =
    `SCANNING ${valid.length} FILE${valid.length > 1 ? 'S' : ''}`;

  actions.classList.remove('hidden');
  downloadAllBtn.classList.add('hidden');

  results.className = 'results';

  results.innerHTML =
    '<div class="loading">Checking metadata, filename clues and visible content locally…</div>';

  for (let i = 0; i < valid.length; i++) {
    const file = valid[i];

    badge.textContent = `SCANNING ${i + 1}/${valid.length}`;

    try {
      state.reports.push(
        await inspectFile(file, {
          visualScan: true
        })
      );
    } catch (error) {
      state.reports.push({
        file,
        type: classify(file),
        error: error.message || 'Could not inspect file.'
      });
    }
  }

  renderReports(state.reports);

  badge.textContent =
    `${valid.length} FILE${valid.length > 1 ? 'S' : ''} CHECKED`;
}

async function inspectFile(file, options = {}) {
  const type = classify(file);

  let base;

  if (type === 'image') {
    base = await inspectImage(file, options);
  }

  if (type === 'pdf') {
    base = await inspectPdf(file);
  }

  if (type === 'docx') {
    base = await inspectDocx(file);
  }

  if (!base) {
    throw new Error('Unsupported file type.');
  }

  const filenameSignals = scanFilename(file.name);

  const allSignals = [
    ...(base.signals || []),
    ...filenameSignals
  ];

  const risk = scoreRisk(allSignals);

  return {
    ...base,
    filenameSignals,
    signals: dedupeSignals(allSignals),
    risk
  };
}

async function inspectImage(file, { visualScan = true } = {}) {
  const signals = [];

  const meta = await exifr.parse(file, {
    tiff: true,
    exif: true,
    gps: true,
    xmp: true,
    iptc: true,
    icc: false,
    jfif: false,
    ihdr: true,
    translateValues: true,
    reviveValues: true,
    mergeOutput: true
  }) || {};

  let gps = null;

  try {
    const foundGps = await exifr.gps(file);

    if (
      foundGps &&
      Number.isFinite(foundGps.latitude) &&
      Number.isFinite(foundGps.longitude)
    ) {
      gps = foundGps;
    }
  } catch {}

  if (
    !gps &&
    Number.isFinite(meta.latitude) &&
    Number.isFinite(meta.longitude)
  ) {
    gps = {
      latitude: meta.latitude,
      longitude: meta.longitude
    };
  }

  const date = first(
    meta.DateTimeOriginal,
    meta.CreateDate,
    meta.ModifyDate,
    meta.DateTime
  );

  const device = [
    first(meta.Make),
    first(meta.Model)
  ]
    .filter(Boolean)
    .join(' ') || null;

  const other = compact({
    Software: meta.Software,
    Artist: meta.Artist,
    Copyright: meta.Copyright,
    Description: meta.ImageDescription,
    Creator: meta.Creator,
    Lens: meta.LensModel
  });

  if (gps) {
    signals.push(
      signal(
        'location',
        'high',
        'Embedded GPS coordinates',
        `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`
      )
    );
  }

  if (date) {
    signals.push(
      signal(
        'time',
        'medium',
        'Embedded capture/creation time',
        formatDate(date)
      )
    );
  }

  if (device) {
    signals.push(
      signal(
        'device',
        'low',
        'Camera or device fingerprint',
        device
      )
    );
  }

  for (const [key, value] of Object.entries(other)) {
    const identity =
      /artist|creator|copyright/i.test(key);

    signals.push(
      signal(
        identity ? 'identity' : 'metadata',
        identity ? 'medium' : 'low',
        `${key} metadata`,
        String(value)
      )
    );
  }

  let visual = {
    text: '',
    findings: [],
    qr: [],
    attempted: false,
    available: true
  };

  if (visualScan) {
    visual = await inspectVisibleImageContent(file);

    signals.push(...visual.findings);

    for (const qr of visual.qr) {
      signals.push(
        signal(
          'visible',
          'high',
          'QR/barcode content',
          qr
        )
      );
    }
  }

  return {
    file,
    type: 'image',

    location: gps
      ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`
      : null,

    date,
    device,
    other,
    visual,
    signals
  };
}

async function inspectPdf(file) {
  const signals = [];

  const bytes = await file.arrayBuffer();

  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true
  });

  const other = compact({
    Title: safeGet(() => pdf.getTitle()),
    Author: safeGet(() => pdf.getAuthor()),
    Subject: safeGet(() => pdf.getSubject()),
    Keywords: safeGet(() => pdf.getKeywords()),
    Creator: safeGet(() => pdf.getCreator()),
    Producer: safeGet(() => pdf.getProducer())
  });

  const date =
    formatDate(
      safeGet(() => pdf.getCreationDate())
    ) ||
    formatDate(
      safeGet(() => pdf.getModificationDate())
    );

  if (date) {
    signals.push(
      signal(
        'time',
        'medium',
        'PDF creation/modification time',
        date
      )
    );
  }

  for (const [key, value] of Object.entries(other)) {
    const identity = /author/i.test(key);

    signals.push(
      signal(
        identity ? 'identity' : 'metadata',
        identity ? 'medium' : 'low',
        `PDF ${key}`,
        String(value)
      )
    );
  }

  return {
    file,
    type: 'pdf',
    location: null,
    date,
    device: null,
    other,
    visual: null,
    signals
  };
}

async function inspectDocx(file) {
  const signals = [];

  const zip = await JSZip.loadAsync(
    await file.arrayBuffer()
  );

  const core = zip.file('docProps/core.xml');
  const appProps = zip.file('docProps/app.xml');

  const other = {};

  let date = null;

  if (core) {
    const xml = await core.async('text');

    const doc = new DOMParser().parseFromString(
      xml,
      'application/xml'
    );

    const pick = (...names) => {
      for (const name of names) {
        const elements =
          [...doc.getElementsByTagNameNS('*', name)];

        if (elements[0]?.textContent?.trim()) {
          return elements[0].textContent.trim();
        }
      }

      return null;
    };

    Object.assign(
      other,
      compact({
        Author: pick('creator'),
        'Last modified by': pick('lastModifiedBy'),
        Title: pick('title'),
        Subject: pick('subject'),
        Keywords: pick('keywords'),
        Description: pick('description')
      })
    );

    date =
      pick('created') ||
      pick('modified');
  }

  if (appProps) {
    const xml = await appProps.async('text');

    const doc = new DOMParser().parseFromString(
      xml,
      'application/xml'
    );

    const company =
      [...doc.getElementsByTagNameNS('*', 'Company')]
        [0]?.textContent?.trim();

    const application =
      [...doc.getElementsByTagNameNS('*', 'Application')]
        [0]?.textContent?.trim();

    Object.assign(
      other,
      compact({
        Company: company,
        Application: application
      })
    );
  }

  if (date) {
    signals.push(
      signal(
        'time',
        'medium',
        'Document creation/modification time',
        date
      )
    );
  }

  for (const [key, value] of Object.entries(other)) {
    const identity =
      /author|modified by|company/i.test(key);

    signals.push(
      signal(
        identity ? 'identity' : 'metadata',
        identity ? 'medium' : 'low',
        `DOCX ${key}`,
        String(value)
      )
    );
  }

  const extras = await inspectDocxExtras(zip);

  signals.push(...extras.signals);

  Object.assign(
    other,
    extras.summary
  );

  return {
    file,
    type: 'docx',
    location: null,
    date,
    device: null,
    other,
    visual: null,
    signals
  };
}

async function inspectDocxExtras(zip) {
  const signals = [];
  const summary = {};

  const paths = Object.keys(zip.files);

  const commentPaths =
    paths.filter(path =>
      /^word\/comments.*\.xml$/i.test(path)
    );

  if (commentPaths.length) {
    summary.Comments =
      `${commentPaths.length} comment-related part${commentPaths.length > 1 ? 's' : ''}`;

    signals.push(
      signal(
        'identity',
        'high',
        'Comments/review data present',
        summary.Comments
      )
    );
  }

  const custom =
    zip.file('docProps/custom.xml');

  if (custom) {
    summary['Custom properties'] =
      'Present';

    signals.push(
      signal(
        'metadata',
        'medium',
        'Custom document properties',
        'Present'
      )
    );
  }

  const relPaths =
    paths.filter(path =>
      /_rels\/.*\.rels$/i.test(path)
    );

  const links = new Set();

  for (const path of relPaths) {
    const entry =
      zip.file(path);

    if (!entry) continue;

    const xml =
      await entry.async('text');

    for (
      const match of xml.matchAll(
        /Target="(https?:\/\/[^"#]+[^\"]*)"/gi
      )
    ) {
      links.add(
        decodeXml(match[1])
      );
    }
  }

  if (links.size) {
    summary['External links'] =
      `${links.size} found`;

    signals.push(
      signal(
        'visible',
        'medium',
        'External links embedded in document',
        [...links]
          .slice(0, 3)
          .join(' · ')
      )
    );
  }

  return {
    signals,
    summary
  };
}

function scanFilename(filename) {
  const signals = [];

  const base =
    filename.replace(/\.[^.]+$/, '');

  const normalized =
    base.replace(/[_]+/g, ' ');

  const datePatterns = [
    /\b(20\d{2})[-_. ](0?[1-9]|1[0-2])[-_. ](0?[1-9]|[12]\d|3[01])\b/g,
    /\b(0?[1-9]|[12]\d|3[01])[-_. ](0?[1-9]|1[0-2])[-_. ](20\d{2})\b/g,
    /\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g
  ];

  const timePatterns = [
    /\b(?:[01]?\d|2[0-3])[:._-][0-5]\d(?:[:._-][0-5]\d)?\b/g,
    /\bat\s+(?:[01]?\d|2[0-3])[._:-][0-5]\d(?:[._:-][0-5]\d)?\b/gi,
    /\b(?:0\d|1\d|2[0-3])(?:[0-5]\d)(?:[0-5]\d)?\b/g
  ];

  for (const pattern of datePatterns) {
    const matches =
      [...normalized.matchAll(pattern)]
        .map(match => match[0]);

    if (matches.length) {
      signals.push(
        signal(
          'filename',
          'medium',
          'Date exposed in filename',
          unique(matches).join(', ')
        )
      );

      break;
    }
  }

  for (const pattern of timePatterns) {
    const matches =
      [...normalized.matchAll(pattern)]
        .map(match => match[0]);

    if (matches.length) {
      signals.push(
        signal(
          'filename',
          'medium',
          'Time exposed in filename',
          unique(matches).join(', ')
        )
      );

      break;
    }
  }

  if (
    /\bwhatsapp\b|\bWA\d{3,}\b/i.test(base)
  ) {
    signals.push(
      signal(
        'filename',
        'low',
        'Source/app clue in filename',
        'WhatsApp-style filename'
      )
    );
  }

  if (
    /\b(?:screenshot|screen shot|screen[_ -]?record(?:ing)?)\b/i
      .test(normalized)
  ) {
    signals.push(
      signal(
        'filename',
        'low',
        'File type clue in filename',
        'Screenshot/screen recording naming pattern'
      )
    );
  }

  const emails =
    normalized.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    );

  if (emails) {
    signals.push(
      signal(
        'filename',
        'high',
        'Email address in filename',
        unique(emails).join(', ')
      )
    );
  }

  const phoneNumbers =
    findPhoneNumbers(normalized);

  if (phoneNumbers.length) {
    signals.push(
      signal(
        'filename',
        'high',
        'Phone-like number in filename',
        phoneNumbers.join(', ')
      )
    );
  }

  const idLike =
    normalized.match(
      /\b[A-Z]{2,5}[-_ ]?\d{5,}\b/gi
    );

  if (idLike) {
    signals.push(
      signal(
        'filename',
        'medium',
        'ID-like code in filename',
        unique(idLike)
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  return signals;
}

async function inspectVisibleImageContent(file) {
  const visual = {
    text: '',
    findings: [],
    qr: [],
    attempted: true,
    available: true
  };

  try {
    visual.qr =
      await detectQrAndBarcodes(file);
  } catch {}

  try {
    const text =
      await runLocalOcr(file);

    visual.text =
      text || '';

    visual.findings =
      scanVisibleText(visual.text);

  } catch (error) {
    visual.available = false;

    visual.error =
      error?.message ||
      'OCR unavailable';
  }

  return visual;
}

async function runLocalOcr(file) {
  if (state.ocrUnavailable) {
    throw new Error(
      'OCR unavailable in this browser/session.'
    );
  }

  if ('TextDetector' in window) {
    const bitmap =
      await createImageBitmap(file);

    try {
      const detector =
        new window.TextDetector();

      const blocks =
        await detector.detect(bitmap);

      return blocks
        .map(block =>
          block.rawValue ||
          block.text ||
          ''
        )
        .filter(Boolean)
        .join('\n');

    } finally {
      bitmap.close();
    }
  }

  try {
    if (!state.ocrWorker) {
      const Tesseract =
        await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
        );

      state.ocrWorker =
        await Tesseract.createWorker(
          'eng',
          1,
          {
            logger: () => {}
          }
        );
    }

    const result =
      await state.ocrWorker.recognize(file);

    return result?.data?.text || '';

  } catch {
    state.ocrUnavailable = true;

    throw new Error(
      'Visual text scan could not start. Metadata and filename checks still completed.'
    );
  }
}

async function detectQrAndBarcodes(file) {
  if (!('BarcodeDetector' in window)) {
    return [];
  }

  const formats =
    await window.BarcodeDetector.getSupportedFormats();

  const preferred = [
    'qr_code',
    'data_matrix',
    'pdf417',
    'aztec',
    'code_128',
    'ean_13'
  ].filter(format =>
    formats.includes(format)
  );

  if (!preferred.length) {
    return [];
  }

  const bitmap =
    await createImageBitmap(file);

  try {
    const detector =
      new window.BarcodeDetector({
        formats: preferred
      });

    const found =
      await detector.detect(bitmap);

    return unique(
      found
        .map(item => item.rawValue)
        .filter(Boolean)
    ).slice(0, 10);

  } finally {
    bitmap.close();
  }
}

function scanVisibleText(text) {
  if (!text?.trim()) {
    return [];
  }

  const findings = [];

  const clean =
    text
      .replace(/\s+/g, ' ')
      .trim();

  const emails =
    unique(
      clean.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
      ) || []
    );

  if (emails.length) {
    findings.push(
      signal(
        'visible',
        'high',
        'Email address visible in image',
        emails
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  const urls =
    unique(
      clean.match(
        /\b(?:https?:\/\/|www\.)[^\s<>{}\[\]]+/gi
      ) || []
    );

  if (urls.length) {
    findings.push(
      signal(
        'visible',
        'medium',
        'URL visible in image',
        urls
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  const phones =
    findPhoneNumbers(clean);

  if (phones.length) {
    findings.push(
      signal(
        'visible',
        'high',
        'Phone number visible in image',
        phones
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  const otp =
    unique(
      (clean.match(/\b\d{4,8}\b/g) || [])
        .filter(number => {
          const position =
            clean.indexOf(number);

          const nearby =
            clean.slice(
              Math.max(0, position - 30),
              position + number.length + 30
            );

          return /\b(?:otp|code|verification|verify|pin|passcode)\b/i
            .test(nearby);
        })
    );

  if (otp.length) {
    findings.push(
      signal(
        'visible',
        'high',
        'OTP/PIN-like code visible',
        otp
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  const accountLike =
    unique(
      clean.match(/\b\d{9,18}\b/g) || []
    )
      .filter(number =>
        !looksLikeDateDigits(number)
      );

  if (accountLike.length) {
    findings.push(
      signal(
        'visible',
        'high',
        'Long account/ID-like number visible',
        accountLike
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  const ipAddresses =
    unique(
      clean.match(
        /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
      ) || []
    );

  if (ipAddresses.length) {
    findings.push(
      signal(
        'visible',
        'medium',
        'IP address visible',
        ipAddresses
          .slice(0, 3)
          .join(', ')
      )
    );
  }

  const addressCue =
    clean.match(
      /\b(?:street|st\.?|road|rd\.?|lane|ln\.?|avenue|ave\.?|sector|block|floor|flat|house|pin(?:code)?|postal|zip)\b/i
    );

  if (addressCue) {
    findings.push(
      signal(
        'visible',
        'medium',
        'Possible address/location text visible',
        extractAround(
          clean,
          addressCue.index,
          90
        )
      )
    );
  }

  const dateTime =
    unique([
      ...(clean.match(
        /\b(?:0?[1-9]|[12]\d|3[01])[\/-](?:0?[1-9]|1[0-2])[\/-](?:20)?\d{2}\b/g
      ) || []),

      ...(clean.match(
        /\b20\d{2}[\/-](?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])\b/g
      ) || []),

      ...(clean.match(
        /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[AP]M)?\b/gi
      ) || [])
    ]);

  if (dateTime.length) {
    findings.push(
      signal(
        'visible',
        'medium',
        'Date/time visible in image',
        dateTime
          .slice(0, 4)
          .join(', ')
      )
    );
  }

  return findings;
}

function scoreRisk(signals) {
  const weights = {
    high: 28,
    medium: 14,
    low: 6
  };

  let score = 0;

  const seen =
    new Set();

  for (const current of dedupeSignals(signals)) {
    const key =
      `${current.category}:${current.label}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    score +=
      weights[current.severity] || 0;
  }

  score =
    Math.min(100, score);

  let level =
    'CLEAR';

  if (score >= 70) {
    level = 'HIGH';
  } else if (score >= 35) {
    level = 'MEDIUM';
  } else if (score > 0) {
    level = 'LOW';
  }

  return {
    score,
    level
  };
}

function renderReports(reports) {
  results.innerHTML =
    reports.map((report, index) => {

      if (report.error) {
        return `
          <article class="file-card">

            <div class="file-head">
              <div>
                <b>${escapeHtml(report.file.name)}</b>
                <small>${prettyBytes(report.file.size)}</small>
              </div>

              <span class="warn">
                Could not inspect
              </span>
            </div>

            <p>
              ${escapeHtml(report.error)}
            </p>

          </article>
        `;
      }

      const signals =
        report.signals || [];

      const high =
        signals.filter(
          item => item.severity === 'high'
        );

      const medium =
        signals.filter(
          item => item.severity === 'medium'
        );

      const low =
        signals.filter(
          item => item.severity === 'low'
        );

      const locationSignals =
        signals.filter(
          item =>
            item.category === 'location'
        );

      const timeSignals =
        signals.filter(item => {

          if (
            !['time', 'filename']
              .includes(item.category)
          ) {
            return false;
          }

          return /date|time|capture|creation/i
            .test(
              `${item.label} ${item.value}`
            );
        });

      const identitySignals =
        signals.filter(item =>
          [
            'identity',
            'device'
          ].includes(item.category)
        );

      const visibleSignals =
        signals.filter(
          item =>
            item.category === 'visible'
        );

      const riskText =
        report.risk.level === 'CLEAR'
          ? 'No obvious privacy signals found in the checks PrivateBox could perform.'
          : `${signals.length} privacy signal${signals.length === 1 ? '' : 's'} found · ${high.length} high · ${medium.length} medium · ${low.length} low`;

      const ocrNote =
        report.type === 'image' &&
        report.visual?.attempted &&
        !report.visual?.available
          ? `
            <p class="muted">
              <b>Visual text scan unavailable:</b>
              ${escapeHtml(
                report.visual.error ||
                'OCR could not run.'
              )}
              Filename and metadata checks still ran.
            </p>
          `
          : '';

      return `
        <article class="file-card">

          <div class="file-head">

            <div>
              <b>
                ${escapeHtml(report.file.name)}
              </b>

              <small>
                ${report.type.toUpperCase()}
                ·
                ${prettyBytes(report.file.size)}
              </small>
            </div>

            <span>
              ${index + 1}/${reports.length}
            </span>

          </div>

          <div class="detail-grid">

            ${detail(
              '⚠',
              `Privacy exposure · ${report.risk.score}/100`,
              riskText,
              report.risk.score > 0,
              report.risk.level
            )}

            ${detail(
              '⌖',
              'Location exposure',
              summarizeSignals(
                locationSignals,
                'No embedded GPS found'
              ),
              locationSignals.length > 0
            )}

            ${detail(
              '◷',
              'Date & time exposure',
              summarizeSignals(
                timeSignals,
                'No date/time exposure found'
              ),
              timeSignals.length > 0
            )}

            ${detail(
              '▣',
              'Identity & device clues',
              summarizeSignals(
                identitySignals,
                'No common identity/device clues found'
              ),
              identitySignals.length > 0
            )}

            ${detail(
              '≡',
              'Visible content',
              summarizeSignals(
                visibleSignals,
                report.type === 'image'
                  ? 'No obvious visible privacy patterns found'
                  : 'Visual OCR applies to images'
              ),
              visibleSignals.length > 0
            )}

            ${detail(
              '⌕',
              'Filename exposure',
              summarizeSignals(
                report.filenameSignals || [],
                'Filename does not expose an obvious clue'
              ),
              (report.filenameSignals || []).length > 0
            )}

          </div>

          ${ocrNote}

          ${
            signals.length
              ? `
                <div class="privacy-findings">

                  <p>
                    <b>
                      Why PrivateBox flagged it
                    </b>
                  </p>

                  ${signals
                    .map(item => `
                      <p>
                        •
                        <b>
                          ${escapeHtml(item.label)}
                        </b>
                        —
                        ${escapeHtml(item.value)}
                      </p>
                    `)
                    .join('')}

                </div>
              `
              : ''
          }

          <div id="verify-${index}"></div>

          <div
            id="download-${index}"
            class="single-download">
          </div>

        </article>
      `;
    }).join('');
}

function detail(
  icon,
  label,
  value,
  found,
  override = null
) {
  const status =
    override ||
    (found ? 'FOUND' : 'CLEAR');

  return `
    <div class="detail">

      <span>
        ${icon}
      </span>

      <div>
        <b>
          ${escapeHtml(label)}
        </b>

        <p>
          ${escapeHtml(String(value))}
        </p>
      </div>

      <em class="${found ? 'found' : ''}">
        ${escapeHtml(status)}
      </em>

    </div>
  `;
}

function summarizeSignals(
  signals,
  emptyText
) {
  if (!signals?.length) {
    return emptyText;
  }

  return signals
    .slice(0, 3)
    .map(item =>
      `${item.label}: ${item.value}`
    )
    .join(' · ');
}

async function cleanAll() {
  cleanAllBtn.disabled = true;

  cleanAllBtn.textContent =
    'Cleaning + verifying locally…';

  state.cleaned.clear();

  for (
    let i = 0;
    i < state.files.length;
    i++
  ) {
    const file =
      state.files[i];

    const originalReport =
      state.reports[i];

    try {
      const cleaned =
        await cleanFile(file);

      state.cleaned.set(
        file.name,
        cleaned
      );

      let verified = null;

      try {
        const cleanFileObject =
          new File(
            [cleaned.blob],
            cleaned.name,
            {
              type: cleaned.blob.type,
              lastModified: Date.now()
            }
          );

        verified =
          await inspectFile(
            cleanFileObject,
            {
              visualScan: false
            }
          );
      } catch {}

      const verifySlot =
        document.querySelector(
          `#verify-${i}`
        );

      if (
        verifySlot &&
        verified
      ) {
        const before =
          originalReport?.risk?.score ?? 0;

        const after =
          verified?.risk?.score ?? 0;

        const remaining =
          verified.signals || [];

        verifySlot.innerHTML = `
          <div class="detail-grid">

            ${detail(
              '✓',
              'Clean-copy verification',
              `Before: ${before}/100 · After: ${after}/100${remaining.length ? ` · ${remaining.length} signal(s) remain` : ' · common metadata removed'}`,
              after > 0,
              after === 0
                ? 'CLEANER'
                : 'CHECK'
            )}

          </div>
        `;
      }

      const slot =
        document.querySelector(
          `#download-${i}`
        );

      if (slot) {
        const button =
          document.createElement(
            'button'
          );

        button.className =
          'secondary';

        button.textContent =
          'Save safe-to-share copy';

        button.addEventListener(
          'click',
          () => {
            saveBlob(
              cleaned.blob,
              cleaned.name
            );
          }
        );

        slot.replaceChildren(
          button
        );
      }

    } catch (error) {
      const slot =
        document.querySelector(
          `#download-${i}`
        );

      if (slot) {
        slot.textContent =
          `Could not clean: ${error.message}`;
      }
    }
  }

  cleanAllBtn.disabled = false;

  cleanAllBtn.textContent =
    'Recreate safe-to-share copies';

  if (state.cleaned.size > 1) {
    downloadAllBtn.classList.remove(
      'hidden'
    );
  }
}

async function cleanFile(file) {
  const type =
    classify(file);

  if (type === 'image') {
    return cleanImage(file);
  }

  if (type === 'pdf') {
    return cleanPdf(file);
  }

  if (type === 'docx') {
    return cleanDocx(file);
  }

  throw new Error(
    'Unsupported file type.'
  );
}

async function cleanImage(file) {
  const bitmap =
    await createImageBitmap(file);

  const canvas =
    document.createElement('canvas');

  canvas.width =
    bitmap.width;

  canvas.height =
    bitmap.height;

  const context =
    canvas.getContext(
      '2d',
      {
        alpha: true
      }
    );

  context.drawImage(
    bitmap,
    0,
    0
  );

  bitmap.close();

  const requestedType =
    file.type === 'image/png'
      ? 'image/png'
      : file.type === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';

  const blob =
    await new Promise(
      (resolve, reject) => {

        canvas.toBlob(
          result => {
            if (result) {
              resolve(result);
            } else {
              reject(
                new Error(
                  'Could not create cleaned image.'
                )
              );
            }
          },

          requestedType,

          requestedType === 'image/jpeg'
            ? 0.96
            : undefined
        );
      }
    );

  return {
    blob,
    name: safeShareName(
      file.name
    )
  };
}

async function cleanPdf(file) {
  const pdf =
    await PDFDocument.load(
      await file.arrayBuffer(),
      {
        ignoreEncryption: true
      }
    );

  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setCreator('');
  pdf.setProducer('');

  try {
    const epoch =
      new Date(0);

    pdf.setCreationDate(epoch);
    pdf.setModificationDate(epoch);
  } catch {}

  const bytes =
    await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false
    });

  return {
    blob: new Blob(
      [bytes],
      {
        type: PDF_TYPE
      }
    ),

    name: safeShareName(
      file.name
    )
  };
}

async function cleanDocx(file) {
  const zip =
    await JSZip.loadAsync(
      await file.arrayBuffer()
    );

  [
    'docProps/core.xml',
    'docProps/app.xml',
    'docProps/custom.xml'
  ].forEach(path =>
    zip.remove(path)
  );

  for (
    const path of Object.keys(
      zip.files
    )
  ) {
    if (
      /^word\/(comments|people|persons|commentsExtended|commentsIds).*\.xml$/i
        .test(path)
    ) {
      zip.remove(path);
    }
  }

  const blob =
    await zip.generateAsync({
      type: 'blob',
      mimeType: DOCX_TYPE,
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });

  return {
    blob,
    name: safeShareName(
      file.name
    )
  };
}

async function downloadAll() {
  const zip =
    new JSZip();

  for (
    const item of state.cleaned.values()
  ) {
    zip.file(
      item.name,
      item.blob
    );
  }

  const blob =
    await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });

  saveBlob(
    blob,
    'PrivateBox-safe-to-share.zip'
  );
}

function saveBlob(blob, name) {
  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = url;
  link.download = name;
  link.style.display = 'none';

  document.body.appendChild(
    link
  );

  link.click();

  setTimeout(() => {
    link.remove();

    URL.revokeObjectURL(
      url
    );
  }, 1500);
}

function safeShareName(name) {
  const dot =
    name.lastIndexOf('.');

  const extension =
    dot > 0
      ? name.slice(dot)
      : '';

  return `PrivateBox-safe-${cryptoRandomId()}${extension}`;
}

function cryptoRandomId() {
  const bytes =
    new Uint8Array(5);

  crypto.getRandomValues(
    bytes
  );

  return [...bytes]
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, '0')
    )
    .join('');
}

function signal(
  category,
  severity,
  label,
  value
) {
  return {
    category,
    severity,
    label,
    value: String(
      value ?? ''
    ).trim()
  };
}

function dedupeSignals(signals) {
  const map =
    new Map();

  for (
    const current of signals || []
  ) {
    if (
      !current?.label ||
      !current?.value
    ) {
      continue;
    }

    const key =
      `${current.category}|${current.severity}|${current.label}|${current.value}`
        .toLowerCase();

    if (!map.has(key)) {
      map.set(
        key,
        current
      );
    }
  }

  return [...map.values()];
}

function findPhoneNumbers(text) {
  const candidates =
    text.match(
      /(?:\+?\d[\d\s().-]{7,}\d)/g
    ) || [];

  return unique(
    candidates
      .map(value =>
        value.trim()
      )
      .filter(value => {
        const digits =
          value.replace(
            /\D/g,
            ''
          );

        return (
          digits.length >= 10 &&
          digits.length <= 15 &&
          !looksLikeDateDigits(
            digits
          )
        );
      })
  ).slice(0, 5);
}

function looksLikeDateDigits(value) {
  return (
    /^20\d{6}$/.test(value) ||
    /^\d{8}$/.test(value)
  );
}

function extractAround(
  text,
  index,
  radius = 80
) {
  return text
    .slice(
      Math.max(
        0,
        index - radius
      ),

      Math.min(
        text.length,
        index + radius
      )
    )
    .trim();
}

function decodeXml(value) {
  const element =
    document.createElement(
      'textarea'
    );

  element.innerHTML =
    value;

  return element.value;
}

function unique(values) {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map(value =>
          String(value).trim()
        )
        .filter(Boolean)
    )
  ];
}

function compact(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== ''
      )
  );
}

function first(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
  ) || null;
}

function safeGet(callback) {
  try {
    return callback();
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime()
    )
  ) {
    return value.toLocaleString();
  }

  return String(value);
}

function prettyBytes(size) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (
    size < 1024 ** 2
  ) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replace(
      /[&<>'"]/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[character])
    );
}

function clearPreviewUrls() {
  for (const url of state.previewUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }

  state.previewUrls = [];
}


function renderUploadedFilePreviews(files) {
  clearPreviewUrls();

  if (!files.length) {
    previewSection.innerHTML = '';
    previewSection.classList.add('hidden');
    return;
  }

  previewSection.classList.remove('hidden');

  previewSection.innerHTML = `
    <div class="uploaded-preview-header">

      <span>
        ${
          files.length === 1
            ? 'Uploaded file'
            : `${files.length} uploaded files`
        }
      </span>

      <button id="changeFilesBtn" type="button">
        Change
      </button>

    </div>

    <div class="uploaded-file-list">
      ${files.map((file, index) => {
        return createUploadedFilePreview(file, index, files.length);
      }).join('')}
    </div>
  `;

  document
    .querySelector('#changeFilesBtn')
    ?.addEventListener('click', () => {
      input.click();
    });
}


function createUploadedFilePreview(file, index, total) {
  const type = classify(file);

  let visual = '';

  if (type === 'image') {
    const url = URL.createObjectURL(file);

    state.previewUrls.push(url);

    visual = `
      <div class="uploaded-file-visual">

        <img
          src="${url}"
          alt="${escapeHtml(file.name)}"
        />

      </div>
    `;
  }

  else if (type === 'pdf') {
    const url = URL.createObjectURL(file);

    state.previewUrls.push(url);

    visual = `
      <div class="uploaded-file-visual">

        <object
          data="${url}#page=1&toolbar=0&navpanes=0"
          type="application/pdf"
        >

          <div class="uploaded-file-placeholder">
            <strong>PDF</strong>
            <span>PREVIEW UNAVAILABLE</span>
          </div>

        </object>

      </div>
    `;
  }

  else if (type === 'docx') {
    visual = `
      <div class="uploaded-file-visual">

        <div class="uploaded-file-placeholder">

          <strong>DOCX</strong>

          <span>
            WORD DOCUMENT
          </span>

        </div>

      </div>
    `;
  }

  return `
    <article class="uploaded-file-card">

      ${visual}

      <div class="uploaded-file-info">

        <div>

          <div class="uploaded-file-name">
            ${escapeHtml(file.name)}
          </div>

          <span class="uploaded-file-meta">
            ${type.toUpperCase()}
            ·
            ${prettyBytes(file.size)}
          </span>

        </div>

        <span class="uploaded-file-number">
          ${index + 1}/${total}
        </span>

      </div>

    </article>
  `;
}
