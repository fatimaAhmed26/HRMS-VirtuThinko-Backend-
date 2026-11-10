// /api/scanner - Import completed form (design screens 16-17), HR only:
//   GET  /status  is the AI key set up?
//   POST /form    read a filled VTHR-ONB-F01 form, returned as Add employee answers
// Files are read in memory and not stored here; saving happens through Add employee.
import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { scanLimiter } from '../../middleware/rateLimit';
import { uploadForm } from '../../middleware/upload';
import { asyncHandler } from '../../utils/asyncHandler';
import { logAudit } from '../../utils/audit';
import { isDocx } from '../../utils/docx';
import { detectFileType } from '../../utils/fileStorage';
import { HttpError } from '../../utils/httpError';
import { readOnboardingForm } from './form-import';
import { scannerReady } from './scanner.ai';

const router = Router();
router.use(authenticate);
// HR only: these forms hold personal and ID details
router.use(requirePermission('document:view'));

// lets the screen show "not set up" before anyone uploads a file
router.get('/status', (_req, res) => {
  res.json({ ready: scannerReady() });
});

// Import completed form: Word (.docx), PDF, or a photo of the paper form
router.post('/form', requirePermission('employee:create'), scanLimiter, uploadForm, asyncHandler(async (req, res) => {
  const file = req.file!;
  let kind: 'docx' | 'pdf' | 'image';
  let mime: string;
  if (isDocx(file.buffer)) {
    kind = 'docx';
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else {
    if (file.buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
      throw new HttpError(400, 'This is an old Word file (.doc). Open it in Word and "Save as" .docx, or save it as PDF');
    }
    const t = detectFileType(file.buffer); // PDF, JPEG or PNG
    kind = t.mime === 'application/pdf' ? 'pdf' : 'image';
    mime = t.mime;
  }

  const form = await readOnboardingForm({ buffer: file.buffer, mime, kind });

  // record that a form was read, never its contents
  await logAudit({
    actorUserId: req.user!.id, action: 'employee.form_import', entity: 'Employee', entityId: 'new',
    changes: { kind, size: file.size, fieldsRead: Object.keys(form.fields).length }, ip: req.ip ?? null,
  });

  res.json({ kind, fileName: file.originalname.slice(0, 150), ...form });
}));

export default router;
