import { Router } from 'express';
import * as documentsController from './documents.controller';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createDocumentSchema } from './documents.schemas';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);
documentsRouter.get('/', documentsController.listDocuments);
documentsRouter.post('/', validateBody(createDocumentSchema), documentsController.createDocument);
documentsRouter.get('/:id', documentsController.getDocument);
