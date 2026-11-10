import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './middleware.js';
import { ALLOWED_MIME } from './validate.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 5 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Only PDF, image, Word, Excel, PowerPoint, text or CSV files are allowed.'));
  },
});

// Wraps multer so errors reach the normal error handler (Section 5.3: approved
// file types and the 10 MB limit).
export function acceptFiles(field, maxCount = 1) {
  const handler = maxCount === 1 ? upload.single(field) : upload.array(field, maxCount);
  return (req, res, next) => handler(req, res, (err) => next(err));
}
