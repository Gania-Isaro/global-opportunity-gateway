import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './middleware.js';
import { ALLOWED_MIME } from './validate.js';

const NOT_ALLOWED = 'Only PDF, image, Word, Excel, PowerPoint, text or CSV files are allowed.';
const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const isOffice = (folder) => (buf) => startsWith(buf, [0x50, 0x4b, 0x03, 0x04])
  && buf.includes('[Content_Types].xml') && buf.includes(folder);
const isOle = (buf) => startsWith(buf, OLE);

// Plain text has no NUL bytes, unless it is marked as UTF-16.
const isText = (buf) => startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff]) || !buf.includes(0);

// Each approved extension, its stored type and a check of the file's real content.
const FILE_TYPES = {
  pdf: ['application/pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
  png: ['image/png', (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  jpg: ['image/jpeg', (b) => startsWith(b, [0xff, 0xd8, 0xff])],
  jpeg: ['image/jpeg', (b) => startsWith(b, [0xff, 0xd8, 0xff])],
  gif: ['image/gif', (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))],
  txt: ['text/plain', isText],
  csv: ['text/csv', isText],
  doc: ['application/msword', isOle],
  xls: ['application/vnd.ms-excel', isOle],
  ppt: ['application/vnd.ms-powerpoint', isOle],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', isOffice('word/')],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', isOffice('xl/')],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', isOffice('ppt/')],
};

// Section 5.3: the browser's label can be faked, so the content is checked too.
function checkFile(file) {
  const ext = file.originalname.split('.').pop().toLowerCase();
  const type = FILE_TYPES[ext];
  if (!type || !file.buffer.length || !type[1](file.buffer)) throw new HttpError(400, NOT_ALLOWED);
  file.mimetype = type[0];
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 5 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, NOT_ALLOWED));
  },
});

// Wraps multer so errors reach the normal error handler (Section 5.3: approved
// file types and the 10 MB limit).
export function acceptFiles(field, maxCount = 1) {
  const handler = maxCount === 1 ? upload.single(field) : upload.array(field, maxCount);
  return (req, res, next) => handler(req, res, (err) => {
    if (err) return next(err);
    try {
      (req.file ? [req.file] : req.files || []).forEach(checkFile);
      next();
    } catch (e) {
      next(e);
    }
  });
}
