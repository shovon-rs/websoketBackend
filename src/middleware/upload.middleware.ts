import multer from 'multer';
import { NextFunction, Request, Response } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

export function avatarUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('avatar')(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 5MB or smaller'
          : err instanceof Error
            ? err.message
            : 'Invalid upload';
      res.status(400).json({ error: { code: 'INVALID_UPLOAD', message } });
      return;
    }
    next();
  });
}

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
];
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const attachmentUploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('This file type is not supported'));
      return;
    }
    cb(null, true);
  },
});

export function attachmentUpload(req: Request, res: Response, next: NextFunction): void {
  attachmentUploader.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'File must be 20MB or smaller'
          : err instanceof Error
            ? err.message
            : 'Invalid upload';
      res.status(400).json({ error: { code: 'INVALID_UPLOAD', message } });
      return;
    }
    next();
  });
}
