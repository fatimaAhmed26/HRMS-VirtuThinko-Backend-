import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { MAX_FILE_SIZE } from '../utils/fileStorage';
import { HttpError } from '../utils/httpError';

// Keep the upload in memory first so we can check its real type 
const multerSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
}).single('file');

// Wraps multer so its errors become clear 400 messages
export function uploadSingle(req: Request, res: Response, next: NextFunction) {
  multerSingle(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (maximum 5 MB)'
        : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Send exactly one file in the "file" field'
        : err.message;
      return next(new HttpError(400, message));
    }
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, 'No file uploaded (use the "file" field)'));
    next();
  });
}